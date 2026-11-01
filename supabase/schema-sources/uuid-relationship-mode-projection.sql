-- Apply after the canonical relationship-mode migration on the native UUID
-- messaging track. Retains its mode policy; adapts only the inbox projection.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('public.messaging_list_conversations(uuid,integer)') is null
 or to_regprocedure('social_private.peer(uuid,uuid)') is null
 or to_regclass('social_private.relationship_modes') is null then
  raise exception 'Native messaging and canonical relationship modes required' using errcode='22023';
 end if;
end $$;
create or replace function public.social_inbox(page_in integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor(); result jsonb; items jsonb;
begin
 if page_in is null or page_in not between 1 and 10000 then raise exception 'Invalid inbox page' using errcode='22023';end if;
 result:=public.messaging_list_conversations(actor,page_in);
 select coalesce(jsonb_agg(
   jsonb_set(item,'{participants}',social_private.participants((item->>'id')::uuid,actor))
   ||jsonb_build_object('mode',origin.mode) order by ord),'[]') into items
 from jsonb_array_elements(result->'conversations') with ordinality rows(item,ord)
 left join social_private.relationship_modes origin
  on origin.user_a=least(actor,social_private.peer((item->>'id')::uuid,actor))
  and origin.user_b=greatest(actor,social_private.peer((item->>'id')::uuid,actor));
 return jsonb_set(result,'{conversations}',items);
end $$;
notify pgrst,'reload schema';
commit;
