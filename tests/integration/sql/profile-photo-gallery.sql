begin;
set local plpgsql.check_asserts=on;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('f9800000-0000-4000-8000-000000000001',now(),false),
 ('f9800000-0000-4000-8000-000000000002',now(),false);
set local role authenticated;
select set_config('request.jwt.claim.sub','f9800000-0000-4000-8000-000000000001',true);
do $$
declare
 owner constant uuid := 'f9800000-0000-4000-8000-000000000001';
 images text[] := array['/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z',
'/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJwAHgL/2Q==',
'/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCewFIh3//Z',
'/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALwAHkJ//9k='];
 command jsonb;
 i int;
begin
 -- The first photo was uploaded through the pre-gallery client.
 perform public.save_profile_photo(jsonb_build_object('expectedRevision',0,'requestId',gen_random_uuid(),'jpegBase64',images[1]));
 assert public.get_profile_photo_gallery(owner)='{"revision":1,"count":1}'::jsonb;
 for i in 2..4 loop
  command := jsonb_build_object('expectedRevision',i-1,'requestId',gen_random_uuid(),'action','append','jpegBase64',images[i]);
  assert public.edit_profile_photo_gallery(command) = jsonb_build_object('revision',i,'count',i);
  assert public.edit_profile_photo_gallery(command) = jsonb_build_object('revision',i,'count',i);
 end loop;
 begin
  perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',4,'requestId',gen_random_uuid(),'action','append','jpegBase64',images[1]));
  raise exception 'Fifth photo accepted';
 exception when sqlstate 'PH409' then null;
 end;
 assert public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',4,'requestId',gen_random_uuid(),'action','move','position',4,'toPosition',1)) = '{"revision":5,"count":4}'::jsonb;
 assert decode(public.read_profile_photo(owner,5)->>'jpegBase64','base64') = decode(images[4],'base64');
 assert decode(public.read_profile_photo_slot(owner,5,2)->>'jpegBase64','base64') = decode(images[1],'base64');
 assert decode(public.read_profile_photo_slot(owner,5,4)->>'jpegBase64','base64') = decode(images[3],'base64');
 begin
  perform public.read_profile_photo_slot(owner,4,2);
  raise exception 'Stale gallery revision was served';
 exception when sqlstate 'PT404' then null;
 end;
 assert public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',5,'requestId',gen_random_uuid(),'action','remove','position',1)) = '{"revision":6,"count":3}'::jsonb;
 assert decode(public.read_profile_photo(owner,6)->>'jpegBase64','base64') = decode(images[1],'base64');
 begin
  perform public.save_profile_photo(jsonb_build_object('expectedRevision',6,'requestId',gen_random_uuid(),'jpegBase64',null));
  raise exception 'Legacy photo deletion removed additional images';
 exception when check_violation then null;
 end;
 for i in 6..8 loop
  perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',i,'requestId',gen_random_uuid(),'action','remove','position',1));
 end loop;
 assert public.get_profile_photo_gallery(owner)='{"revision":9,"count":0}'::jsonb;
 assert public.get_profile_photo_state()->>'hasPhoto'='false';
 -- Leave a picture to verify an unrelated account cannot read gallery metadata or bytes.
 perform public.edit_profile_photo_gallery(jsonb_build_object('expectedRevision',9,'requestId',gen_random_uuid(),'action','append','jpegBase64',images[1]));
end $$;
select set_config('request.jwt.claim.sub','f9800000-0000-4000-8000-000000000002',true);
do $$
declare owner constant uuid := 'f9800000-0000-4000-8000-000000000001';
begin
 begin
  perform public.get_profile_photo_gallery(owner);
  raise exception 'Unauthorised gallery metadata was visible';
 exception when sqlstate 'PT404' then null;
 end;
 begin
  perform public.read_profile_photo_slot(owner,10,1);
  raise exception 'Unauthorised photo was visible';
 exception when sqlstate 'PT404' then null;
 end;
end $$;
rollback;
