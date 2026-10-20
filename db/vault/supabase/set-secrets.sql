-- Creates or updates the police vault's Supabase Vault secrets: the bridge to the civic
-- database and photo deletion. Run by .github/workflows/police-deploy.yml:
--
--   psql "$VAULT_DB_URL" -q -f db/vault/supabase/set-secrets.sql
--
-- Values are read from environment variables (never command-line arguments), so they
-- don't appear in process lists or logs. Every one is required.
\set ON_ERROR_STOP on
\set civic_rest_url ''
\set civic_anon_key ''
\set police_bridge_secret ''
\set vault_storage_url ''
\set vault_service_role_key ''
\getenv civic_rest_url CIVIC_REST_URL
\getenv civic_anon_key CIVIC_ANON_KEY
\getenv police_bridge_secret POLICE_BRIDGE_SECRET
\getenv vault_storage_url VAULT_STORAGE_URL
\getenv vault_service_role_key VAULT_SERVICE_ROLE_KEY

create function pg_temp.put_secret(p_name text, p_value text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_value, '') = '' then
    raise exception 'missing value for secret %', p_name;
  end if;
  if exists (select 1 from vault.secrets where name = p_name) then
    perform vault.update_secret((select id from vault.secrets where name = p_name), p_value);
  else
    perform vault.create_secret(p_value, p_name);
  end if;
end;
$$;

\o /dev/null
select pg_temp.put_secret('civic_rest_url', :'civic_rest_url');
select pg_temp.put_secret('civic_anon_key', :'civic_anon_key');
select pg_temp.put_secret('police_bridge_secret', :'police_bridge_secret');
select pg_temp.put_secret('vault_storage_url', :'vault_storage_url');
select pg_temp.put_secret('vault_service_role_key', :'vault_service_role_key');
\o
select 'vault secrets set: ' || string_agg(name, ', ' order by name)
from vault.secrets
where name in ('civic_rest_url', 'civic_anon_key', 'police_bridge_secret', 'vault_storage_url', 'vault_service_role_key');
