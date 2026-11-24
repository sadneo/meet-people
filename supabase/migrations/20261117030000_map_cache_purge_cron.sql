-- Every environment purges expired map locations on the same schedule. This was
-- previously arranged by hand per project; cron.schedule updates a job of the same name.
do $$ begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('pebble-map-cache-purge','*/15 * * * *','select location_private.purge_map_locations();');
  end if;
end $$;
