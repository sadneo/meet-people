-- Five interests total; completed interest chapters need three provided choices.
-- Existing labels remain readable and are never removed or replaced by rollout.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('public.reconciliation_profile_write(jsonb)') is null
 or to_regprocedure('public.reconciliation_chapters(jsonb,jsonb)') is null
 or to_regprocedure('public.interest_policy_profile_write(jsonb)') is not null then
  raise exception 'Reviewed canonical profile prerequisites missing or changed' using errcode='22023';
 end if;
end $$;

create function public.valid_profile_interests(labels jsonb,require_minimum boolean) returns boolean
language plpgsql immutable set search_path='' as $$
declare provided integer; custom_count integer;
begin
 if jsonb_typeof(labels) is distinct from 'array' then return false; end if;
 if jsonb_array_length(labels)>5 then return false; end if;
 if exists(select 1 from jsonb_array_elements(labels) x where jsonb_typeof(x)<>'string' or char_length(btrim(x #>> '{}')) not between 1 and 120)
 or (select count(*)<>count(distinct btrim(x)) from jsonb_array_elements_text(labels) x) then return false; end if;
 select count(*) filter(where btrim(x) collate "C" in ('Coffee','Art','Music','Outdoors','Food','Gaming','Photography','Movies','Fitness','Study','Sports')),
 count(*) filter(where btrim(x) collate "C" not in ('Coffee','Art','Music','Outdoors','Food','Gaming','Photography','Movies','Fitness','Study','Sports'))
 into provided,custom_count from jsonb_array_elements_text(labels) x;
 return custom_count<=2 and (not require_minimum or provided>=3);
end $$;
revoke all on function public.valid_profile_interests(jsonb,boolean) from public,anon,authenticated;

alter function public.reconciliation_profile_write(jsonb) rename to interest_policy_profile_write;
revoke all on function public.interest_policy_profile_write(jsonb) from public,anon,authenticated;
create function public.reconciliation_profile_write(profile_in jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.valid_profile_interests(profile_in->'interests',false) then
  raise exception 'Choose up to 5 interests, with at most 2 custom interests' using errcode='22023';
 end if;
 return public.interest_policy_profile_write(profile_in);
end $$;
revoke all on function public.reconciliation_profile_write(jsonb) from public,anon,authenticated;

create or replace function public.reconciliation_chapters(p jsonb,prefs jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare identity jsonb; birth date;
begin
 if p is null or p='null'::jsonb then return '[]'; end if;
 identity:=jsonb_build_object('username',p->'username','display_name',p->'display_name','bio',p->'bio','avatar_url',p->'avatar_url');
 if not public.valid_account_identity(identity) then return '[]'; end if;
 if not public.valid_profile_interests(p->'interests',true) then return '[0]'; end if;
 if jsonb_typeof(prefs->'intents') is distinct from 'array' then return '[0,1]'; end if;
 if jsonb_array_length(prefs->'intents')=0 then return '[0,1]'; end if;
 if coalesce(prefs->>'distance','') not in ('Nearby','5 miles','10 miles')
 or coalesce(prefs->>'group','') not in ('One-on-one','Small groups','Either')
 or coalesce(length(btrim(p->>'location_city')),0)=0
 or jsonb_typeof(p->'availability') is distinct from 'array' then return '[0,1,2]'; end if;
 if jsonb_array_length(p->'availability')=0 or coalesce(p->>'birthdate','') !~ '^\d{4}-\d{2}-\d{2}$' then return '[0,1,2]'; end if;
 begin birth:=(p->>'birthdate')::date;
 exception when others then return '[0,1,2]'; end;
 if to_char(birth,'YYYY-MM-DD')<>p->>'birthdate' then return '[0,1,2]'; end if;
 return '[0,1,2,3]';
end $$;
revoke all on function public.reconciliation_chapters(jsonb,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
