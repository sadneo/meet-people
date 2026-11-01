import { z } from 'zod'
import { campusId,campusLabel,demoPlan } from './plan.js'

export const DevelopmentAnchorSchema=z.object({id:z.uuid(),email:z.email(),username:z.string().min(1).max(80)}).strict()
export type DevelopmentAnchor=z.infer<typeof DevelopmentAnchorSchema>
const literal=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`

/** Inside seedSql's existing transaction/provider fence. No identity/profile edits. */
export function developmentSetup(anchor:DevelopmentAnchor){
 const primary=DevelopmentAnchorSchema.parse(anchor),defaults=demoPlan(2)[0]
 return `reset role;
do $owner$ begin
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id='${primary.id}' and u.email=${literal(primary.email)}#>>'{}' and u.raw_app_meta_data->'pebble_development'='true'::jsonb and not u.is_anonymous and p.username=${literal(primary.username)}#>>'{}') then raise exception 'Dedicated development account ownership changed';end if;
end $owner$;
set local role authenticated;
do $development$ declare a jsonb;d jsonb;settings jsonb;f jsonb;search jsonb;receipt jsonb;begin
 perform set_config('request.jwt.claim.sub','${primary.id}',true);
 perform set_config('request.jwt.claims','{"sub":"${primary.id}","role":"authenticated"}',true);
 a:=public.get_account();
 if a->'profile'='null'::jsonb or jsonb_array_length(a->'completed')<>4 then raise exception 'Complete the dedicated development account onboarding first';end if;
 if a->'settings'->>'discoverable'<>'true' then perform public.save_account(jsonb_set(a,'{settings}',a->'settings'||'{"discoverable":true}'));end if;
 settings:=public.get_detailed_settings();
 if settings->'settings'->>'friendsDiscovery'<>'true' or settings->'settings'->>'datingDiscovery'<>'true' then
  perform public.save_detailed_settings(jsonb_build_object('expectedRevision',settings->'revision','settings',settings->'settings'||'{"friendsDiscovery":true,"datingDiscovery":true}'));
 end if;
 f:=public.get_friends_search_preferences();
 search:=case when f->'preferences'='null'::jsonb then ${literal(defaults.filters)} else f->'preferences' end;
 receipt:=public.resolve_search_area(jsonb_build_object('requestId',gen_random_uuid(),'mode','friends','source','temporary','placeId','${campusId}'));
 search:=jsonb_set(search,'{searchArea}',jsonb_build_object('source','temporary','areaLabel','${campusLabel}','resolvedLocationRef',receipt->>'id'));
 perform public.save_friends_search_preferences(jsonb_build_object('expectedRevision',f->'revision','preferences',search));
 d:=public.get_dating_preferences();
 if d->'profile'->>'enabled'='true' then perform public.set_dating_enabled(jsonb_build_object('expectedProfileRevision',d->'profileRevision','expectedSearchRevision',d->'searchRevision','enabled',false));d:=public.get_dating_preferences();end if;
 -- Only a wholly empty fictional development persona receives test defaults.
 if d->'profile'->>'gender'='' and d->'profile'->>'sexuality'='' and d->'profile'->>'intent'='' and d->'profile'->>'style'='' then d:=jsonb_set(d,'{profile}',${literal(defaults.dating)});end if;
 search:=case when d->'search'='null'::jsonb then ${literal(defaults.filters)}-'goals' else d->'search' end;
 receipt:=public.resolve_search_area(jsonb_build_object('requestId',gen_random_uuid(),'mode','dating','source','temporary','placeId','${campusId}'));
 search:=jsonb_set(search,'{searchArea}',jsonb_build_object('source','temporary','areaLabel','${campusLabel}','resolvedLocationRef',receipt->>'id'));
 perform public.save_dating_preferences(jsonb_build_object('expectedProfileRevision',d->'profileRevision','expectedSearchRevision',d->'searchRevision','profile',d->'profile','search',search));
 d:=public.get_dating_preferences();
 perform public.set_dating_enabled(jsonb_build_object('expectedProfileRevision',d->'profileRevision','expectedSearchRevision',d->'searchRevision','enabled',true));
 if public.get_friends_runtime()->>'canJoin'<>'true' or public.get_dating_runtime()->>'canStart'<>'true' then raise exception 'Development discovery setup incomplete; review saved preferences';end if;
end $development$;
`
}
