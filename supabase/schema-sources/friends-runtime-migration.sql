-- Capability readback accompanies the reviewed real active matcher, never a flag
-- that fabricates candidates, bypasses account readiness, or starts a queue.
begin;
set local lock_timeout='3s';
do $$ begin
 if to_regprocedure('active_private.ranking(uuid)') is null or not exists(select 1 from pg_proc where oid='public.get_queue_match()'::regprocedure and prosecdef and pg_get_userbyid(proowner)=current_user and position('active_private.ranking(actor)' in prosrc)>0) then raise exception 'Reviewed active matcher prerequisite missing' using errcode='22023';end if;
end $$;
create function public.get_friends_runtime() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=safety_private.actor();begin
 return jsonb_build_object('available',true,'policy','nearby-first-v1','canJoin',exists(select 1 from active_private.people() p where p.person=actor));end $$;
revoke all on function public.get_friends_runtime() from public,anon,authenticated;
grant execute on function public.get_friends_runtime() to authenticated;
do $$ begin if has_function_privilege('anon','public.get_friends_runtime()','EXECUTE') or not has_function_privilege('authenticated','public.get_friends_runtime()','EXECUTE') then raise exception 'Friends runtime ACL mismatch' using errcode='42501';end if;end $$;
commit;
