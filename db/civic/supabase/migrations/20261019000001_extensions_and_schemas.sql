-- Civic database: extensions and the three schema zones
-- (architecture doc, "Data architecture").
--   core         private civic data, reached only by server code (service role)
--   public_read  views the public internet may read with the anon key
--   ops          queues, staff, agency tokens, audit log

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;

create schema if not exists core;
create schema if not exists public_read;
create schema if not exists ops;

revoke all on schema core, ops from public, anon, authenticated;
grant usage on schema core, ops to service_role;
grant usage on schema public_read to anon, authenticated, service_role;

-- Server code (service role) owns everything in core and ops.
alter default privileges in schema core grant all on tables to service_role;
alter default privileges in schema core grant all on sequences to service_role;
alter default privileges in schema core grant execute on functions to service_role;
alter default privileges in schema ops grant all on tables to service_role;
alter default privileges in schema ops grant all on sequences to service_role;
alter default privileges in schema ops grant execute on functions to service_role;

-- Functions are not executable by anon/authenticated unless granted explicitly.
alter default privileges in schema core revoke execute on functions from public;
alter default privileges in schema ops revoke execute on functions from public;
alter default privileges in schema public_read revoke execute on functions from public;
