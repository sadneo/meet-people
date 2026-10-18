\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts = on;
-- No real credentials or provider calls: all checks roll back.
delete from vault.secrets where name in ('pebble_project_url', 'pebble_ingest_token', 'pebble_embed_secret');
do $$ begin
  assert not has_function_privilege('anon', 'public.get_gemini_embedding(text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.get_gemini_embedding(text)', 'execute');
  assert not has_schema_privilege('anon', 'hosting_private', 'usage');
  assert not has_schema_privilege('authenticated', 'hosting_private', 'usage');
  assert not has_function_privilege('authenticated', 'hosting_private.ingest_sbengaged()', 'execute');
  assert hosting_private.ingest_sbengaged() is null;
  assert (select count(*) = 1 from cron.job where jobname = 'pebble-ingest-sbengaged' and schedule = '17 * * * *');
  begin
    perform public.get_gemini_embedding('Coffee');
    raise exception 'Missing configuration accepted';
  exception when raise_exception then
    assert sqlerrm = 'Embedding service is not configured';
  end;
  begin
    perform public.get_gemini_embedding(repeat('x', 10001));
    raise exception 'Unbounded input accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;
