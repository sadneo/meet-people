create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron with schema pg_catalog;

-- The URL and shared secret are configured in Vault after deployment.
create or replace function public.get_gemini_embedding(interest_text text)
returns double precision[] language plpgsql security definer set search_path = '' as $$
declare
  project_url text;
  shared_secret text;
  resp extensions.http_response;
  embedding_arr double precision[];
begin
  if interest_text is null or length(btrim(interest_text)) not between 1 and 10000 then
    raise exception 'Invalid embedding input' using errcode = '22023';
  end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'pebble_project_url';
  select decrypted_secret into shared_secret from vault.decrypted_secrets where name = 'pebble_embed_secret';
  if project_url is null or shared_secret is null then
    raise exception 'Embedding service is not configured';
  end if;
  -- Preserve the existing two-second ceiling for synchronous enrichment.
  perform set_config('http.curlopt_timeout_ms', '2000', true);
  resp := extensions.http((
    'POST', project_url || '/functions/v1/embed-interest',
    array[extensions.http_header('Content-Type', 'application/json'),
          extensions.http_header('x-embed-secret', shared_secret)],
    'application/json', jsonb_build_object('text', interest_text)::text
  )::extensions.http_request);
  if resp.status <> 200 then raise exception 'Embedding service unavailable'; end if;
  select array_agg(value::double precision) into embedding_arr
    from jsonb_array_elements_text(resp.content::jsonb -> 'embedding');
  if cardinality(embedding_arr) is distinct from 3072 or exists (
    select 1 from unnest(embedding_arr) v where v is null or v::text in ('NaN', 'Infinity', '-Infinity')
  ) then raise exception 'Invalid embedding response'; end if;
  return embedding_arr;
end;
$$;
-- Profile writes and matching already run through owner-controlled RPCs.
-- Do not expose a paid provider proxy as an arbitrary browser RPC.
revoke all on function public.get_gemini_embedding(text) from public, anon, authenticated;
grant execute on function public.get_gemini_embedding(text) to service_role;

create schema if not exists hosting_private;
revoke all on schema hosting_private from public, anon, authenticated;
create function hosting_private.ingest_sbengaged() returns bigint
language plpgsql security definer set search_path = '' as $$
declare project_url text; ingest_token text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'pebble_project_url';
  select decrypted_secret into ingest_token from vault.decrypted_secrets where name = 'pebble_ingest_token';
  -- Local databases and unconfigured deployments never call the network.
  if project_url is null or ingest_token is null then return null; end if;
  return net.http_post(
    url := project_url || '/functions/v1/ingest-sbengaged',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', ingest_token),
    body := '{"mode":"full","dryRun":false}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function hosting_private.ingest_sbengaged() from public, anon, authenticated;
select cron.schedule('pebble-ingest-sbengaged', '17 * * * *', 'select hosting_private.ingest_sbengaged()');
