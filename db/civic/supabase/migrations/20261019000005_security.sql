-- Row-level security: on for every table. anon/authenticated get nothing in
-- core or ops; the public reads only public_read views (next migration).
-- The service role (server code) bypasses RLS.

alter table core.lgas enable row level security;
alter table core.wards enable row level security;
alter table core.agencies enable row level security;
alter table core.issues enable row level security;
alter table core.reports enable row level security;
alter table core.media enable row level security;
alter table core.status_events enable row level security;
alter table core.metoos enable row level security;
alter table ops.idempotency_keys enable row level security;
alter table ops.staff enable row level security;
alter table ops.agency_tokens enable row level security;
alter table ops.audit_log enable row level security;
alter table ops.bot_sessions enable row level security;

grant all on all tables in schema core to service_role;
grant all on all sequences in schema core to service_role;
grant all on all tables in schema ops to service_role;
grant all on all sequences in schema ops to service_role;

-- Functions: only the service role may call them.
revoke execute on all functions in schema core from public, anon, authenticated;
revoke execute on all functions in schema ops from public, anon, authenticated;
grant execute on all functions in schema core to service_role;
grant execute on all functions in schema ops to service_role;

-- Staff can read their own profile (used after sign-in).
create policy staff_read_own on ops.staff
  for select to authenticated
  using (user_id = (select auth.uid()));
grant usage on schema ops to authenticated;
grant select on ops.staff to authenticated;

-- Audit every status change.
create or replace function ops.audit_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.audit_log (actor_id, action, target_table, target_id, details)
  values (
    case when new.actor_type = 'moderator' then new.actor_id::uuid end,
    'status:' || new.to_status, 'core.issues', new.issue_id::text,
    jsonb_build_object('from', new.from_status, 'actor_type', new.actor_type, 'actor_id', new.actor_id)
  );
  return new;
end;
$$;

create trigger status_events_audit after insert on core.status_events
for each row execute function ops.audit_status_event();

-- Storage: private bucket for uploads, public bucket only for moderator-approved copies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media-private', 'media-private', false, 5242880,
   array['image/jpeg', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4']),
  ('media-public', 'media-public', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;
