import { seedMarker,campusId,type DemoProfile,onboardingChapters } from './plan.js'
const literal=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
export function seedSql(profiles:DemoProfile[],photos:Map<string,string>,reset=false){
 if(!profiles.length)throw new Error('No seed profiles')
 let sql=`\\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
do $guard$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or to_regprocedure('public.get_friends_runtime()') is null or to_regprocedure('public.get_dating_runtime()') is null then raise exception 'Local demo schema not ready';end if;
 if not exists(select 1 from location_private.places where id='${campusId}' and enabled and verified_until>statement_timestamp()+interval '1 hour') then raise exception 'Reviewed Stony Brook catalogue entry missing/expired: review and renew it first';end if;
 if exists(select 1 from pg_trigger t where t.tgrelid='public.user_interests'::regclass and not t.tgisinternal and (t.tgname<>'trg_user_interests_embed' or t.tgfoid is distinct from to_regprocedure('public.user_interests_embed()') or t.tgenabled<>'O')) then raise exception 'Interest hooks changed; stop for review';end if;
end $guard$;
-- Transactional DDL: other writers wait and see the original enabled hook after
-- commit. No provider hook is called by this seed; all other triggers stay enabled.
alter table public.user_interests disable trigger trg_user_interests_embed;
`
 for(const p of profiles){
  const data={id:p.id,email:p.email,username:p.username,account:p.account,chapters:onboardingChapters(p.account),dating:p.dating,filters:p.filters,facts:p.facts,photo:photos.get(p.id)??null}
  sql+=`reset role;
do $owner$ begin
 if not exists(select 1 from auth.users where id='${p.id}' and email=${literal(p.email)}#>>'{}' and raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}' and is_anonymous is false) then raise exception 'Demo Auth ownership marker changed';end if;
end $owner$;
set local role authenticated;
do $seed$ declare plan jsonb:=${literal(data)};a jsonb;d jsonb;settings jsonb;f jsonb;receipt jsonb;search jsonb;photo jsonb;chapter jsonb;begin
 perform set_config('request.jwt.claim.sub',plan->>'id',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',plan->>'id','role','authenticated')::text,true);
 a:=public.get_account();
 if a->'profile'='null'::jsonb or jsonb_array_length(a->'completed')<4 then
  for chapter in select value from jsonb_array_elements(plan->'chapters') loop
   if jsonb_array_length(chapter->'completed')>=jsonb_array_length(a->'completed') then perform public.save_account(chapter);end if;
  end loop;
 elsif ${reset?'true':'false'} then
  perform public.save_account(plan->'account');
 elsif jsonb_array_length(a->'completed')<>4 then raise exception 'Existing demo onboarding incomplete; use --reset-profiles';
 end if;
 a:=public.get_account();
 if a->'profile'->>'username'<>plan->>'username' or jsonb_array_length(a->'completed')<>4 then raise exception 'Demo canonical readback failed';end if;
 -- Operator explicitly reruns demo participation, preserving shared profile edits.
 perform public.save_account(jsonb_set(a,'{settings}',a->'settings'||'{"discoverable":true,"availability":false}'));
 settings:=public.get_detailed_settings();
 perform public.save_detailed_settings(jsonb_build_object('expectedRevision',settings->'revision','settings',settings->'settings'||'{"friendsDiscovery":true,"datingDiscovery":true}'));
 f:=public.get_profile_details();
 if f->>'revision'='0' or ${reset?'true':'false'} then perform public.save_profile_details(jsonb_build_object('expectedRevision',f->'revision','facts',plan->'facts'));end if;
 f:=public.get_friends_search_preferences();
 search:=case when f->'preferences'='null'::jsonb or ${reset?'true':'false'} then plan->'filters' else f->'preferences' end;
 receipt:=public.resolve_search_area(jsonb_build_object('requestId',gen_random_uuid(),'mode','friends','source','temporary','placeId','${campusId}'));
 search:=jsonb_set(search,'{searchArea}',jsonb_build_object('source','temporary','areaLabel','Stony Brook University','resolvedLocationRef',receipt->>'id'));
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',f->'revision','preferences',search));
 d:=public.get_dating_preferences();
 if d->'profile'->>'enabled'='true' then perform public.set_dating_enabled(jsonb_build_object('expectedProfileRevision',d->'profileRevision','expectedSearchRevision',d->'searchRevision','enabled',false));d:=public.get_dating_preferences();end if;
 search:=case when d->'search'='null'::jsonb or ${reset?'true':'false'} then (plan->'filters')-'goals' else d->'search' end;
 receipt:=public.resolve_search_area(jsonb_build_object('requestId',gen_random_uuid(),'mode','dating','source','temporary','placeId','${campusId}'));
 search:=jsonb_set(search,'{searchArea}',jsonb_build_object('source','temporary','areaLabel','Stony Brook University','resolvedLocationRef',receipt->>'id'));
 perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',d->'profileRevision','expectedSearchRevision',d->'searchRevision','profile',case when d->>'profileRevision'='0' or ${reset?'true':'false'} then plan->'dating' else d->'profile' end,'search',search));
 d:=public.get_dating_preferences();
 perform public.set_dating_enabled(jsonb_build_object('expectedProfileRevision',d->'profileRevision','expectedSearchRevision',d->'searchRevision','enabled',true));
 photo:=public.get_profile_photo_state();
 if plan->>'photo' is not null and (photo->>'revision'='0' or ${reset?'true':'false'}) then perform public.save_profile_photo(jsonb_build_object('expectedRevision',photo->'revision','requestId',gen_random_uuid(),'jpegBase64',plan->>'photo'));end if;
 if public.get_friends_runtime()->>'canJoin'<>'true' or public.get_dating_runtime()->>'canStart'<>'true' then raise exception 'Demo participation readback failed';end if;
end $seed$;
`
 }
 return sql+`reset role;
alter table public.user_interests enable trigger trg_user_interests_embed;
commit;
`
}
