-- Runs in the disposable native and legacy schema replay databases only.
begin;
insert into auth.users(id, email, is_anonymous) values
 ('ce400000-0000-4000-8000-000000000001','cancel-a@example.test',false),
 ('ce400000-0000-4000-8000-000000000002','cancel-b@example.test',false),
 ('ce400000-0000-4000-8000-000000000003','cancel-c@example.test',false);
insert into public.profiles(id,username,display_name,birthdate,location_city) values
 ('ce400000-0000-4000-8000-000000000001','cancel-test-a','Typing A','2000-01-01','Synthetic campus'),
 ('ce400000-0000-4000-8000-000000000002','cancel-test-b','Typing B','2000-01-01','Synthetic campus'),
 ('ce400000-0000-4000-8000-000000000003','cancel-test-c','Typing C','2000-01-01','Synthetic campus');
insert into public.account_settings(user_id,preferences,settings,completed)
 select id,'{"distance":"Nearby","group":"Either","intents":["Meet new people"],"usual":[]}',
 '{"notifications":false,"availability":false,"discoverable":true,"location":false}','[0,1,2,3]'
 from public.profiles where username like 'cancel-test-%';
insert into public.user_interests(profile_id,text)
 select p.id,label from public.profiles p cross join unnest(array['Art','Coffee','Music']) label where username like 'cancel-test-%';
insert into public.availability(profile_id,dow,start_time,end_time)
 select id,1,'12:00','17:00' from public.profiles where username like 'cancel-test-%';

set local plpgsql.check_asserts = on;
set local role authenticated;
do $$
declare
  sender uuid := 'ce400000-0000-4000-8000-000000000001';
  recipient uuid := 'ce400000-0000-4000-8000-000000000002';
  sent_at timestamptz;
  accepted jsonb;
begin
  assert not has_function_privilege('anon', 'public.cancel_sent_request(uuid,timestamptz)', 'execute');
  perform set_config('request.jwt.claim.sub', sender::text, true);
  perform public.social_connection(recipient,'request');
  sent_at := (public.social_connection_list()->'sent'->0->>'requested_at')::timestamptz;
  assert sent_at is not null;
  assert not public.cancel_sent_request(recipient, sent_at - interval '1 second');

  perform set_config('request.jwt.claim.sub', recipient::text, true);
  assert not public.cancel_sent_request(sender, sent_at);
  accepted := public.social_connection(sender,'accept');
  assert accepted->>'status' = 'connected' and accepted->>'conversationId' is not null;

  perform set_config('request.jwt.claim.sub', sender::text, true);
  assert not public.cancel_sent_request(recipient, sent_at);
  assert public.social_connection(recipient,'get') = accepted;

  recipient := 'ce400000-0000-4000-8000-000000000003';
  perform public.social_connection(recipient,'request');
  sent_at := (public.social_connection_list()->'sent'->0->>'requested_at')::timestamptz;
  assert public.cancel_sent_request(recipient, sent_at);
  assert public.social_connection(recipient,'get')->>'status' = 'none';
  assert not public.cancel_sent_request(recipient, sent_at);
end $$;
rollback;
