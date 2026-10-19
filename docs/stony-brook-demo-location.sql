-- One reviewed PUBLIC campus-area anchor, not anyone's device/home coordinates.
-- Daniel selected Stony Brook for the local demo on2026-10-19.
-- Primary coordinate source: https://itrf.ign.fr/en/site/404738 (40.915,-73.12).
-- Campus identity: https://www.stonybrook.edu/about/maps-and-directions/
-- Approximate campus anchor only; no geocoder/API call or user profile write.
begin;
set local lock_timeout='3s';
set local role pebble_location_catalog_publisher;
do $$ begin
 perform public.publish_search_location_place(jsonb_build_object(
 'id','b641ad29-9f92-4e66-9490-0b616f8fd85c','label','Stony Brook University',
 'region','Stony Brook, New York, United States',
 'aliases',jsonb_build_array('Stony Brook University','Stony Brook','SBU','SUNY Stony Brook'),
 'latitude',40.915,'longitude',-73.12,
 'provenance','Operator-selected campus anchor; coordinates https://itrf.ign.fr/en/site/404738; campus https://www.stonybrook.edu/about/maps-and-directions/; reviewed2026-10-19',
 'verifiedUntil',to_char(statement_timestamp()+interval '7 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));
end $$;
commit;
