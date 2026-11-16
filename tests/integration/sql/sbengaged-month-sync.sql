\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts=on;

do $$ begin
 assert not has_function_privilege('anon','public.sbengaged_claim_photos()','execute');
 assert not has_function_privilege('authenticated','public.sbengaged_begin_sync(text)','execute');
 assert not has_function_privilege('authenticated','public.sbengaged_export_snapshot()','execute');
 assert not has_function_privilege('authenticated','public.sbengaged_runtime_config()','execute');
 assert has_function_privilege('service_role','public.sbengaged_claim_photos()','execute');
 assert not has_table_privilege('service_role','ingestion_private.sbengaged_photos','select');
end $$;
delete from ingestion_private.sbengaged_photos;
update ingestion_private.sbengaged_control set mode='producer',sync_token=null,sync_until=null,photo_token=null,photo_until=null,
 cooldown_until='-infinity',photo_next_run_at='-infinity',snapshot=null;

do $$
declare token uuid; claim jsonb; rows jsonb; first_job jsonb; first_id uuid; total integer; exported jsonb; second_token uuid;
begin
 token:=(public.sbengaged_begin_sync('producer')->>'token')::uuid;
 assert public.sbengaged_begin_sync('producer')->>'state'='busy';
 select jsonb_agg(jsonb_build_object('source','sbengaged','listing_type','event','external_id',(999991000+n)::text,
  'title','Queue fixture '||n,'description',null,'category','queue-fixture','starts_at',now()+make_interval(days=>n),
  'ends_at',now()+make_interval(days=>n,hours=>1),'location_name',null,'source_url','https://sbengaged.stonybrook.edu/rsvp?id='||(999991000+n),
  'last_synced_at',now(),'status','active')) into rows from generate_series(1,12) n;
 assert public.sbengaged_upsert_events(token,rows)=12;
 assert (select count(*) from ingestion_private.sbengaged_photos)=12;
 perform public.sbengaged_finish_sync(token,now(),now()+interval '30 days',array(select r->>'external_id' from jsonb_array_elements(rows)r),true);
 exported:=public.sbengaged_export_snapshot();
 assert exported->>'complete'='true';
 assert exists(select 1 from jsonb_array_elements(exported->'events')r where r->>'external_id'='999991001');
 assert not exists(select 1 from jsonb_array_elements(exported->'events')r where r ?| array['id','actor_id','email','attempts','lease_token']);

 claim:=public.sbengaged_claim_photos();
 assert claim->>'state'='claimed';
 assert jsonb_array_length(claim->'jobs')=10, 'Hard limit of ten source requests per five minutes';
 assert public.sbengaged_claim_photos()->>'state'='busy';
 first_job:=claim->'jobs'->0; first_id:=(first_job->>'listingId')::uuid;
 perform public.sbengaged_complete_photo(first_id,(claim->>'token')::uuid,'photo','https://example.test/poster.jpg',300,200);
 assert (select image_url from public.listings where id=first_id)='https://example.test/poster.jpg';
 assert (select next_attempt_at>now()+interval '5 hours' from ingestion_private.sbengaged_photos where listing_id=first_id);
 begin
  perform public.sbengaged_complete_photo(first_id,gen_random_uuid(),'photo','https://example.test/wrong.jpg',300,200);
  raise exception 'Stale lease accepted';
 exception when raise_exception then assert sqlerrm='Expired photo lease'; end;
 perform public.sbengaged_release_photos((claim->>'token')::uuid);
 assert public.sbengaged_claim_photos()->>'state'='busy', 'Manual triggers cannot bypass the five-minute budget';
 assert not exists(select 1 from ingestion_private.sbengaged_photos where lease_token is not null);

 token:=(public.sbengaged_begin_sync('producer')->>'token')::uuid;
 perform public.sbengaged_upsert_events(token,rows);
 assert (select image_url from public.listings where id=first_id)='https://example.test/poster.jpg', 'Metadata cannot overwrite worker images';
 perform public.sbengaged_release_sync(token);
 exported:=public.sbengaged_export_snapshot();
 assert exists(select 1 from jsonb_array_elements(exported->'events')r where r->>'external_id'=first_job->>'externalId' and r->>'image_url'='https://example.test/poster.jpg');

 update ingestion_private.sbengaged_control set photo_next_run_at='-infinity';
 claim:=public.sbengaged_claim_photos();
 first_job:=claim->'jobs'->0;
 perform public.sbengaged_origin_cooldown(3600);
 perform public.sbengaged_complete_photo((first_job->>'listingId')::uuid,(claim->>'token')::uuid,'rate_limited',null,3600,429);
 perform public.sbengaged_release_photos((claim->>'token')::uuid);
 assert public.sbengaged_claim_photos()->>'state'='cooldown';
 assert public.sbengaged_begin_sync('producer')->>'state'='cooldown', 'Origin cooldown covers calendar imports too';

 update ingestion_private.sbengaged_control set cooldown_until='-infinity',photo_next_run_at='-infinity';
 claim:=public.sbengaged_claim_photos();
 update ingestion_private.sbengaged_control set photo_until=now()-interval '1 second',photo_next_run_at='-infinity';
 update ingestion_private.sbengaged_photos set lease_until=now()-interval '1 second' where lease_token=(claim->>'token')::uuid;
 second_token:=(public.sbengaged_claim_photos()->>'token')::uuid;
 assert second_token is not null and second_token<>(claim->>'token')::uuid;
 first_job:=claim->'jobs'->0;
 begin
  perform public.sbengaged_complete_photo((first_job->>'listingId')::uuid,(claim->>'token')::uuid,'no_photo',null,86400,200);
  raise exception 'Expired worker accepted';
 exception when raise_exception then assert sqlerrm='Expired photo lease'; end;
 perform public.sbengaged_release_photos(second_token);

 update ingestion_private.sbengaged_control set mode='mirror';
 assert public.sbengaged_claim_photos()->>'state'='disabled';
 select count(*) into total from ingestion_private.sbengaged_photos;
 token:=(public.sbengaged_begin_sync('mirror')->>'token')::uuid;
 rows:=jsonb_build_array((rows->0)||jsonb_build_object('external_id','999991099','source_url','https://sbengaged.stonybrook.edu/rsvp?id=999991099',
  'image_url','https://example.test/shared.jpg','details_synced_at',now()));
 assert public.sbengaged_upsert_events(token,rows)=1;
 assert (select count(*) from ingestion_private.sbengaged_photos)=total, 'Mirrors never enqueue duplicate upstream photo work';
 assert (select image_url from public.listings where source='sbengaged' and external_id='999991099')='https://example.test/shared.jpg';
 perform public.sbengaged_release_sync(token);
end $$;
rollback;
