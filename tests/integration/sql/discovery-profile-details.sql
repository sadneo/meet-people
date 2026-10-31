\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts=on;
-- Reserved rollback-only identities; no existing user data or provider writes.
insert into auth.users(id) values
 ('fd000000-0000-4000-8000-000000000001'),('fd000000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name,birthdate) values
 ('fd000000-0000-4000-8000-000000000001','details_fixture_viewer','Synthetic viewer','2000-01-01'),
 ('fd000000-0000-4000-8000-000000000002','details_fixture_target','Synthetic target','2000-01-01');
insert into public.profile_details(user_id,revision,facts) values
 ('fd000000-0000-4000-8000-000000000002',1,'{"education":"Synthetic college","occupation":"Private occupation","languages":["English","Spanish"],"visibility":{"education":true,"occupation":false,"languages":true}}');
insert into matching_private.scoring_settings(user_id,revision,time_zone,show_availability) values
 ('fd000000-0000-4000-8000-000000000001',1,'UTC',false),
 ('fd000000-0000-4000-8000-000000000002',1,'UTC',false);
insert into public.availability(profile_id,dow,start_time,end_time)
 select p.id,d, '12:00'::time,'17:00'::time from public.profiles p cross join generate_series(0,6) d
 where p.id in ('fd000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000002');
do $$ declare v uuid:='fd000000-0000-4000-8000-000000000001';t uuid:='fd000000-0000-4000-8000-000000000002'; result jsonb;begin
 assert not has_function_privilege('authenticated','matching_private.discovery_details(uuid,uuid)','execute');
 assert not has_function_privilege('anon','matching_private.discovery_details(uuid,uuid)','execute');
 result:=matching_private.discovery_details(v,t);
 assert result->'details'='{"education":"Synthetic college","languages":["English","Spanish"]}'::jsonb;
 assert result->'sharedAvailability'='null'::jsonb;
 update matching_private.scoring_settings set show_availability=true where user_id=v;
 assert matching_private.discovery_details(v,t)->'sharedAvailability'='null'::jsonb;
 update matching_private.scoring_settings set show_availability=true where user_id=t;
 result:=matching_private.discovery_details(v,t)->'sharedAvailability';
 assert result is not null and result<>'null'::jsonb;
 assert result->>'period'='afternoon';
 assert result->>'timeZone'='UTC';
 assert (select count(*) from jsonb_object_keys(result))=3;
 -- A timezone difference uses real instants, not matching wall-clock strings.
 update public.availability set start_time='09:00' where profile_id=t;
 update matching_private.scoring_settings set time_zone='America/New_York' where user_id=t;
 assert matching_private.discovery_details(v,t)->'sharedAvailability'<>'null'::jsonb;
 update public.availability set start_time='00:00',end_time='01:00' where profile_id=t;
 assert matching_private.discovery_details(v,t)->'sharedAvailability'='null'::jsonb;
 update public.profile_details set facts=jsonb_set(facts,'{visibility}','{"education":false,"occupation":false,"languages":false}') where user_id=t;
 assert matching_private.discovery_details(v,t)->'details'='{}'::jsonb;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 -- Enrichment must never make an otherwise-ineligible profile visible.
 assert public.project_dating_candidate('fd000000-0000-4000-8000-000000000002')->'candidate'='null'::jsonb;
 assert public.project_friends_candidates('["fd000000-0000-4000-8000-000000000002"]')->'candidates'='[]'::jsonb;
end $$;
rollback;
