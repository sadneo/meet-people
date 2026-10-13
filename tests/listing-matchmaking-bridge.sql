begin;
insert into auth.users(id) values('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002');
insert into public.profiles(id,username,display_name) values('b1000000-0000-4000-8000-000000000001','bridgeone','One'),('b1000000-0000-4000-8000-000000000002','bridgetwo','Two');
insert into public.listings(id,title,source,external_id,starts_at) values('b2000000-0000-4000-8000-000000000001','Bridge test','test','bridge-test',now()+interval '1 day');
-- Fail closed if scoring unexpectedly crosses the provider boundary.
create or replace function public.get_gemini_embedding(interest_text text) returns double precision[] language plpgsql as $$ begin raise exception 'Forbidden provider call'; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
do $$ declare lid uuid:='b2000000-0000-4000-8000-000000000001'; begin
 assert public.get_listing_matchmaking_status(lid)='{"isInterested":false,"available":true}'::jsonb;
 begin perform public.get_listing_event_matches(lid); raise exception 'Missing opt-in accepted'; exception when sqlstate 'PT409' then null; end;
 assert public.express_listing_matchmaking_interest(lid)->>'isInterested'='true';
 perform public.express_listing_matchmaking_interest(lid);
 assert (select count(*) from public.get_listing_event_matches(lid))=0;
end $$;
reset role;
do $$ begin
 assert (select count(*) from public.listing_matchmaking_links)=1;
 assert (select host_id is null from public.meetups)=true;
 assert (select count(*) from public.event_interests)=0;
 assert (select count(*) from public.event_groups)=0;
 assert not has_table_privilege('authenticated','public.listing_matchmaking_links','SELECT');
 assert not has_function_privilege('anon','public.get_listing_event_matches(uuid)','EXECUTE');
end $$;
-- Another actor cannot inherit or withdraw the first actor's consent.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
do $$ declare lid uuid:='b2000000-0000-4000-8000-000000000001'; begin
 assert public.get_listing_matchmaking_status(lid)->>'isInterested'='false';
 perform public.withdraw_listing_matchmaking_interest(lid);
 begin perform public.get_listing_event_matches(lid);raise exception 'No-consent actor accepted';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
reset role;
update public.listings set title='Changed authoritative event' where id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 begin perform public.get_listing_event_matches('b2000000-0000-4000-8000-000000000001'); raise exception 'Stale bridge accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.express_listing_matchmaking_interest('b2000000-0000-4000-8000-000000000001');
end $$;
reset role;
update public.listings set status='cancelled' where id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare lid uuid:='b2000000-0000-4000-8000-000000000001'; begin
 assert public.get_listing_matchmaking_status(lid)='{"isInterested":true,"available":false}'::jsonb;
 begin perform public.express_listing_matchmaking_interest(lid); raise exception 'Cancelled join accepted'; exception when sqlstate 'PT409' then null; end;
 assert public.withdraw_listing_matchmaking_interest(lid)='{"isInterested":false,"available":false}'::jsonb;
 perform public.withdraw_listing_matchmaking_interest(lid);
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_listing_matchmaking_status(lid); raise exception 'Unauthenticated status'; exception when sqlstate '28000' then null; end;
end $$;
reset role;
rollback;
