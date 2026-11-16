-- Photo captions and profile prompts. Disposable replay only; rolls back.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 owner constant uuid := 'f9a00000-0000-4000-8000-000000000001';
 friend constant uuid := 'f9a00000-0000-4000-8000-000000000002';
 stranger constant uuid := 'f9a00000-0000-4000-8000-000000000003';
begin
 insert into auth.users(id,email_confirmed_at,created_at,is_anonymous)
 values(owner,now(),now()-interval '20 days',false),(friend,now(),now()-interval '20 days',false),(stranger,now(),now()-interval '20 days',false);
 insert into public.profiles(id,username,display_name,birthdate)
 values(owner,'captions-owner','Owner','2000-01-01'),(friend,'captions-friend','Friend','2000-01-01'),(stranger,'captions-stranger','Stranger','2000-01-01');
 perform set_config('session_replication_role','replica',true);
 insert into public.connections(user_a,user_b,initiated_by,status,created_at,responded_at)
 values(least(owner,friend),greatest(owner,friend),owner,'accepted',now(),now());
 perform set_config('session_replication_role','origin',true);
end $$;

set local role authenticated;
do $$
declare
 owner constant uuid := 'f9a00000-0000-4000-8000-000000000001';
 first_image constant text := '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z';
 second_image constant text := '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJwAHgL/2Q==';
 result jsonb;
begin
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform public.save_profile_photo(jsonb_build_object('expectedRevision',0,'requestId',gen_random_uuid(),'jpegBase64',first_image));
 perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',1,'requestId',gen_random_uuid(),'action','append','jpegBase64',second_image));
 assert public.get_profile_photo_captions(owner) = '{"revision":2,"captions":[null,null]}'::jsonb, 'Captions start empty';
 result := public.set_profile_photo_caption('{"expectedRevision":2,"position":2,"caption":"  Hiking the bluffs  "}');
 assert result = '{"revision":2,"captions":[null,"Hiking the bluffs"]}'::jsonb, 'Caption not saved or trimmed';
 begin
  perform public.set_profile_photo_caption('{"expectedRevision":1,"position":1,"caption":"Stale"}');
  raise exception 'Stale revision accepted';
 exception when sqlstate 'PH409' then null; end;
 begin
  perform public.set_profile_photo_caption('{"expectedRevision":2,"position":3,"caption":"Missing"}');
  raise exception 'Missing slot accepted';
 exception when sqlstate 'PH409' then null; end;
 begin
  perform public.set_profile_photo_caption(jsonb_build_object('expectedRevision',2,'position',1,'caption',repeat('x',41)));
  raise exception 'Long caption accepted';
 exception when sqlstate '22023' then null; end;
 -- The caption follows its photo when the photos are reordered.
 perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',2,'requestId',gen_random_uuid(),'action','move','position',2,'toPosition',1));
 assert public.get_profile_photo_captions(owner)->'captions' = '["Hiking the bluffs",null]'::jsonb, 'Caption did not follow its photo';
 -- Clearing removes it; removing the photo leaves no caption behind.
 assert public.set_profile_photo_caption('{"expectedRevision":3,"position":1,"caption":""}')->'captions' = '[null,null]'::jsonb, 'Clear failed';
 perform public.set_profile_photo_caption('{"expectedRevision":3,"position":2,"caption":"First photo"}');
 perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',3,'requestId',gen_random_uuid(),'action','remove','position',2));
 assert public.get_profile_photo_captions(owner)->'captions' = '[null]'::jsonb, 'Removed photo kept a caption';
 perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',4,'requestId',gen_random_uuid(),'action','append','jpegBase64',first_image));
 assert public.get_profile_photo_captions(owner)->'captions' = '[null,null]'::jsonb, 'Re-upload revived a removed caption';
 perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',5,'requestId',gen_random_uuid(),'action','remove','position',2));

 -- Prompts: catalog ids, at most three, answers trimmed and bounded.
 result := public.save_profile_customization('{"expectedRevision":0,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null,"prompts":[{"id":"study-spot","answer":"The library roof"},{"id":"first-date","answer":"Coffee and a long walk"}]}}');
 assert jsonb_array_length(result->'customization'->'prompts') = 2, 'Prompts not saved';
 begin
  perform public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null,"prompts":[{"id":"made-up","answer":"x"}]}}');
  raise exception 'Unknown prompt accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null,"prompts":[{"id":"study-spot","answer":" padded "}]}}');
  raise exception 'Untrimmed answer accepted';
 exception when sqlstate '22023' then null; end;
 -- An earlier client that omits prompts keeps the stored ones.
 result := public.save_profile_customization('{"expectedRevision":1,"customization":{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":"pebble"}}');
 assert jsonb_array_length(result->'customization'->'prompts') = 2, 'Omitted prompts were erased';
 assert jsonb_array_length(public.get_profile_prompts(owner,'dating')) = 2, 'Owner cannot see own prompts';

 perform set_config('request.jwt.claim.sub','f9a00000-0000-4000-8000-000000000002',true);
 assert public.get_profile_photo_captions(owner)->'captions' = '[null]'::jsonb, 'Connection cannot read captions';
 assert public.get_profile_prompts(owner,'friends') = '[{"id":"study-spot","answer":"The library roof"}]'::jsonb, 'Friends prompts wrong';
 assert public.get_profile_prompts(owner,'dating') = '[]'::jsonb, 'Dating prompts shown outside Dating eligibility';

 perform set_config('request.jwt.claim.sub','f9a00000-0000-4000-8000-000000000003',true);
 begin
  perform public.get_profile_prompts(owner,'friends');
  raise exception 'Stranger read prompts';
 exception when sqlstate 'PC404' then null; end;
 begin
  perform public.get_profile_photo_captions(owner);
  raise exception 'Stranger read captions';
 exception when sqlstate 'PT404' then null; end;
end $$;
set local role authenticated;
do $$
declare owner constant uuid := 'f9a00000-0000-4000-8000-000000000001'; base text := '{"interestOrder":[],"audiences":{"education":"both","occupation":"both","languages":"both"},"gardenItem":null';
begin
 perform set_config('request.jwt.claim.sub',owner::text,true);
 -- Per-prompt audiences, up to three per mode.
 assert public.save_profile_customization(jsonb_build_object('expectedRevision',2,'customization',(base||',"datingBio":"Here for something real.","prompts":[{"id":"study-spot","answer":"Library roof","audience":"friends"},{"id":"perfect-saturday","answer":"Long hike","audience":"dating"},{"id":"ask-me-about","answer":"Ramen"}]}')::jsonb))->>'revision' = '3', 'Per-mode prompts not saved';
 assert (select jsonb_agg(x->>'id') from jsonb_array_elements(public.get_profile_prompts(owner,'friends')) x) = '["study-spot","ask-me-about"]'::jsonb, 'Friends prompts wrong';
 assert (select jsonb_agg(x->>'id') from jsonb_array_elements(public.get_profile_prompts(owner,'dating')) x) = '["perfect-saturday","ask-me-about"]'::jsonb, 'Dating prompts wrong';
 assert public.get_profile_customization()->'customization'->>'datingBio' = 'Here for something real.', 'Dating bio not saved';
 assert public.save_profile_customization(jsonb_build_object('expectedRevision',3,'customization',(base||',"prompts":[{"id":"study-spot","answer":"a","audience":"friends"},{"id":"ask-me-about","answer":"b","audience":"friends"},{"id":"currently","answer":"c","audience":"friends"},{"id":"first-date","answer":"d"},{"id":"green-flag","answer":"e"},{"id":"looking-for","answer":"f"}]}')::jsonb))->>'revision' = '4', 'Three per mode rejected';
 assert public.get_profile_customization()->'customization'->>'datingBio' = 'Here for something real.', 'Omitted Dating bio was erased';
 begin
  perform public.save_profile_customization(jsonb_build_object('expectedRevision',4,'customization',(base||',"prompts":[{"id":"study-spot","answer":"a"},{"id":"ask-me-about","answer":"b"},{"id":"currently","answer":"c"},{"id":"proud-of","answer":"d"}]}')::jsonb));
  raise exception 'Four prompts in one mode accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_profile_customization(jsonb_build_object('expectedRevision',4,'customization',(base||',"prompts":[{"id":"first-date","answer":"a","audience":"friends"}]}')::jsonb));
  raise exception 'Dating-only question shown in Friends accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.save_profile_customization(jsonb_build_object('expectedRevision',4,'customization',(base||',"datingBio":" padded "}')::jsonb));
  raise exception 'Untrimmed Dating bio accepted';
 exception when sqlstate '22023' then null; end;
end $$;
reset role;
do $$ begin
 assert not has_table_privilege('authenticated','photo_private.captions','SELECT');
 assert position('datingBio' in pg_get_functiondef('public.project_dating_candidate(uuid)'::regprocedure)) > 0, 'Dating card ignores the Dating bio';
 assert position('datingBio' in pg_get_functiondef('public.find_dating_candidate(jsonb)'::regprocedure)) > 0, 'Fallback Dating card ignores the Dating bio';
 assert not has_function_privilege('anon','public.get_profile_prompts(uuid,text)','EXECUTE');
 assert not has_function_privilege('anon','public.set_profile_photo_caption(jsonb)','EXECUTE');
end $$;
rollback;
