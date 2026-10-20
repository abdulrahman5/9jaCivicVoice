-- pgTAP tests for police report photos (vault side). Run with: pnpm db:vault:test
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(12);

create temp table k as
select '0b1c2d3e-4f50-4617-8899-aabbccddeeff.jpg'::text as a, '1b1c2d3e-4f50-4617-8899-aabbccddeeff.jpg'::text as b;

-- Bucket and access --------------------------------------------------------------------

select is(
  (select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'police-media'),
  'false|409600|image/jpeg', 'the photo bucket is private, JPEG only, 400 KB max');
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'police_media_insert' and cmd = 'INSERT' and 'anon' = any (roles)),
  'the Worker key may add photos');
select ok(
  not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and 'anon' = any (roles) and cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL')),
  'and nothing else: no reading, replacing or deleting');
select ok(
  (select with_check from pg_policies where policyname = 'police_media_insert') like '%[0-9a-f]{8}%',
  'object names must be random ids');

-- Media keys on reports -------------------------------------------------------------------

select lives_ok(
  $$ select police.submit_report('lagos', 'violence', 'Test place', null, 'today', null, '', null,
       array[(select a from k), (select b from k)], true, false, 's', 'h') $$,
  'a report can carry photo keys');
select throws_ok(
  $$ select police.submit_report('lagos', 'violence', 'Test place', null, 'today', null, '', null,
       array['../other-bucket/x.jpg'], true, false, 's', 'h') $$,
  '23514', null, 'keys that are not photo ids are rejected');
select throws_ok(
  $$ select police.submit_report('lagos', 'violence', 'Test place', null, 'today', null, '', null,
       array[(select a from k), (select a from k), (select a from k), (select b from k)], true, false, 's', 'h') $$,
  '23514', null, 'at most 3 photos');

-- Deletion queue ---------------------------------------------------------------------------

delete from police.reports where media_keys @> array[(select a from k)];
select is(
  (select string_agg(key, ',' order by key) from police.media_deletions),
  (select a || ',' || b from k), 'purging a report queues its photos for deletion');
select is(police.delete_queued_media(), 0, 'without the storage secrets, nothing is sent');

-- Settling earlier requests: success clears the row, failure makes it retry.
update police.media_deletions set request_id = -1, requested_at = now() where key = (select a from k);
update police.media_deletions set request_id = -2, requested_at = now() where key = (select b from k);
insert into net._http_response (id, status_code, created) values (-1, 200, now()), (-2, 500, now());
select police.delete_queued_media();
select ok(not exists (select 1 from police.media_deletions where key = (select a from k)), 'a successful delete clears the queue row');
select ok(
  exists (select 1 from police.media_deletions where key = (select b from k) and request_id is null),
  'a failed delete is retried');

select ok(
  not has_function_privilege('anon', 'police.delete_queued_media()', 'execute'),
  'the Worker key cannot trigger deletions');

select * from finish();
rollback;
