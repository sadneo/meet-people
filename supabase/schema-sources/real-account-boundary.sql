-- REVIEW CANDIDATE: non-anonymous Auth identities for real matchmaking/contact.
-- Does not create/change Auth users, providers or credentials. Missing provider
-- schema aborts; the disposable fixture models only the required boolean flag.
begin;
set local lock_timeout='3s';
do $$ begin
 if not exists(select 1 from pg_attribute where attrelid='auth.users'::regclass and attname='is_anonymous' and atttypid='boolean'::regtype and not attisdropped)
 or to_regprocedure('social_private.discoverable(uuid)') is null then raise exception 'Reviewed non-anonymous Auth prerequisite missing' using errcode='22023';end if;
 if not exists(select 1 from pg_proc where oid='safety_private.actor()'::regprocedure and pg_get_userbyid(proowner)=current_user)
 or not exists(select 1 from pg_proc where oid='social_private.discoverable(uuid)'::regprocedure and pg_get_userbyid(proowner)=current_user)
 or not exists(select 1 from pg_proc where oid='safety_private.contact_allowed(uuid,uuid)'::regprocedure and pg_get_userbyid(proowner)=current_user) then raise exception 'Actor helper owner mismatch' using errcode='42501';end if;
end $$;
create or replace function safety_private.actor() returns uuid language plpgsql stable set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or not exists(select 1 from auth.users u where u.id=actor and u.is_anonymous is false) then raise exception 'Verified signed-in account required' using errcode='28000';end if;
 return actor;end $$;
create or replace function social_private.discoverable(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.account_settings a on a.user_id=p.id
 where p.id=person and p.is_active and exists(select 1 from auth.users u where u.id=p.id and u.is_anonymous is false) and public.detailed_settings_masters(a.settings)->>'discoverable'='true'
 and p.birthdate between date '0001-01-01' and date '9999-12-31'
 and p.birthdate<=(statement_timestamp() at time zone 'America/New_York')::date-interval '18 years'
 and char_length(p.username) between 1 and 80 and char_length(p.display_name) between 1 and 120
 and public.profile_language_key(p.username)<>'' and public.profile_language_key(p.display_name)<>''
 and coalesce(char_length(p.bio),0)<=1000 and char_length(p.location_city)<=120 and public.profile_language_key(p.location_city)<>''
 and (select count(*) from public.user_interests i where i.profile_id=p.id) between 3 and 30
 and not exists(select 1 from public.user_interests i where i.profile_id=p.id and (char_length(i.text)>120 or public.profile_language_key(i.text)=''))
 and (select count(*) from public.availability w where w.profile_id=p.id) between 1 and 56
 and not exists(select 1 from public.availability w where w.profile_id=p.id and (w.start_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$' or w.end_time::text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]|24:00:00)$'))
 and not exists(select 1 from public.availability w join public.availability x on x.profile_id=w.profile_id and x.id>w.id where w.profile_id=p.id and w.dow=x.dow and w.start_time<x.end_time and x.start_time<w.end_time)
 and jsonb_typeof(a.preferences->'intents')='array' and jsonb_array_length(a.preferences->'intents') between 1 and 20
 and not exists(select 1 from jsonb_array_elements(a.preferences->'intents') item where jsonb_typeof(item)<>'string' or char_length(item #>> '{}')>120 or public.profile_language_key(item #>> '{}')='')
 and a.preferences->>'distance' in('Nearby','5 miles','10 miles') and a.preferences->>'group' in('One-on-one','Small groups','Either'));
$$;
create or replace function safety_private.contact_allowed(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.safety_pair_allowed(a,b) and (select count(*)=2 from auth.users u where u.id in(a,b) and u.is_anonymous is false)
 and exists(select 1 from public.connections c where c.user_a=least(a,b) and c.user_b=greatest(a,b) and c.status='accepted'
 and not exists(select 1 from safety_private.revoked_connections r where r.connection_id=c.id));
$$;
revoke all on function safety_private.actor(),social_private.discoverable(uuid),safety_private.contact_allowed(uuid,uuid) from public,anon,authenticated;
do $$ declare r text;begin
 foreach r in array array['anon','authenticated'] loop
  if has_function_privilege(r::name,'safety_private.actor()','EXECUTE') or has_function_privilege(r::name,'social_private.discoverable(uuid)','EXECUTE') or has_function_privilege(r::name,'safety_private.contact_allowed(uuid,uuid)','EXECUTE') then raise exception 'Inherited actor helper bypass' using errcode='42501';end if;
 end loop;
end $$;
commit;
