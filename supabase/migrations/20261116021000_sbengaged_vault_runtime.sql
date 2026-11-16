begin;
-- Use the existing Vault authority; no additional Edge-secret permissions or
-- cross-project service-role keys are needed for the read-only public mirror.
create function public.sbengaged_runtime_config() returns jsonb
language plpgsql security definer set search_path='' as $$
declare mode_in text; token text;
begin
 select mode into mode_in from ingestion_private.sbengaged_control where singleton;
 select decrypted_secret into token from vault.decrypted_secrets where name='pebble_sbengaged_export_token';
 if mode_in not in('producer','mirror') or token is null then raise exception 'Source sharing configuration unavailable'; end if;
 return jsonb_build_object('mode',mode_in,'exportToken',token,
  'sharedUrl','https://wacgxhsdhrqigrmqaonc.supabase.co/functions/v1/export-sbengaged');
end $$;
revoke all on function public.sbengaged_runtime_config() from public,anon,authenticated;
grant execute on function public.sbengaged_runtime_config() to service_role;
notify pgrst,'reload schema';
commit;
