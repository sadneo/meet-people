-- One premade or custom interest completes the interest chapter. Existing caps,
-- labels, write reconciliation and function privileges remain unchanged.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function public.valid_profile_interests(labels jsonb,require_minimum boolean) returns boolean
language plpgsql immutable set search_path='' as $$
declare custom_count integer;
begin
 if jsonb_typeof(labels) is distinct from 'array' then return false; end if;
 if jsonb_array_length(labels)>5 then return false; end if;
 if exists(select 1 from jsonb_array_elements(labels) x where jsonb_typeof(x)<>'string' or char_length(btrim(x #>> '{}')) not between 1 and 120)
 or (select count(*)<>count(distinct btrim(x)) from jsonb_array_elements_text(labels) x) then return false; end if;
 select count(*) filter(where btrim(x) collate "C" not in ('Coffee','Art','Music','Outdoors','Food','Gaming','Photography','Movies','Fitness','Study','Sports'))
 into custom_count from jsonb_array_elements_text(labels) x;
 return custom_count<=2 and (not require_minimum or jsonb_array_length(labels)>=1);
end $$;
revoke all on function public.valid_profile_interests(jsonb,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
