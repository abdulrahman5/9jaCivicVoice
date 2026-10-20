-- Police report photos (docs/POLICE.md, task 9).
--
-- Photos are blurred, resized and re-encoded on the reporter's phone, then sent with the
-- report to the intake Worker, which strips any remaining metadata and stores them here.
-- The Worker's anon key may only ADD objects with random names to this bucket; it can't
-- list, read, replace or delete anything. Moderators read through the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('police-media', 'police-media', false, 409600, array['image/jpeg'])
on conflict (id) do nothing;

create policy police_media_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'police-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  );

-- Report media keys are object names in that bucket.
alter table police.reports add constraint reports_media_keys_check check (
  cardinality(media_keys) <= 3
  and array_to_string(media_keys, ',') ~ '^([0-9a-f-]{36}\.jpg(,|$))*$'
);

-- Storage blocks deleting objects with SQL, so purged reports queue their photos here and
-- delete_queued_media() removes them through the Storage API.
create table police.media_deletions (
  key text primary key,
  queued_at timestamptz not null default now(),
  request_id bigint,
  requested_at timestamptz
);
alter table police.media_deletions enable row level security;
grant all on police.media_deletions to service_role;

create function police.queue_media_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into police.media_deletions (key)
  select unnest(old.media_keys)
  on conflict do nothing;
  return old;
end;
$$;

create trigger reports_queue_media_deletion
  after delete on police.reports
  for each row when (cardinality(old.media_keys) > 0)
  execute function police.queue_media_deletion();

-- Hourly. Needs two Supabase Vault secrets in this project:
--   vault_storage_url        https://<vault-ref>.supabase.co/storage/v1
--   vault_service_role_key   this project's service role key
-- Each run first settles earlier requests (pg_net keeps responses for 6 hours): success
-- removes the queue rows; a failure, or no response after a day, makes them retry.
create function police.delete_queued_media()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_keys text[];
  v_request bigint;
begin
  delete from police.media_deletions d
  using net._http_response r
  where r.id = d.request_id and r.status_code between 200 and 299;

  update police.media_deletions d set request_id = null, requested_at = null
  where d.request_id is not null
    and (exists (select 1 from net._http_response r
                 where r.id = d.request_id and (r.status_code is null or r.status_code not between 200 and 299))
         or d.requested_at < now() - interval '1 day');

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'vault_storage_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'vault_service_role_key';
  if v_url is null or v_key is null then
    return 0;
  end if;

  select array_agg(key) into v_keys
  from (select key from police.media_deletions where request_id is null order by queued_at limit 100) q;
  if v_keys is null then
    return 0;
  end if;

  v_request := net.http_delete(
    url := v_url || '/object/police-media',
    headers := jsonb_build_object('apikey', v_key, 'Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('prefixes', to_jsonb(v_keys))
  );
  update police.media_deletions set request_id = v_request, requested_at = now() where key = any (v_keys);
  return cardinality(v_keys);
end;
$$;

revoke execute on function police.queue_media_deletion() from public, anon, authenticated;
revoke execute on function police.delete_queued_media() from public, anon, authenticated;
grant execute on function police.delete_queued_media() to service_role;

select cron.schedule('delete-police-media', '30 * * * *', $$ select police.delete_queued_media() $$);
