-- Creates or updates the civic project's police_bridge_secret, which the police vault
-- presents when it pushes patterns. Run by .github/workflows/police-deploy.yml:
--
--   psql "$CIVIC_DB_URL" -q -f db/civic/supabase/set-police-secret.sql
--
-- The value is read from the POLICE_BRIDGE_SECRET environment variable, never an argument.
\set ON_ERROR_STOP on
\set police_bridge_secret ''
\getenv police_bridge_secret POLICE_BRIDGE_SECRET

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
select pg_temp.put_secret('police_bridge_secret', :'police_bridge_secret');
\o
select 'civic secret set: police_bridge_secret';
