# Ticketmaster takedowns

For a Ticketmaster removal request, delete the exact server-side record by its source and external ID:

```sql
delete from public.listings
where source = 'ticketmaster'
  and external_id = '<ticketmaster-event-id>';
```

Before running the deletion, verify the target without exposing it to the client:

```sql
select id, title, source, external_id
from public.listings
where source = 'ticketmaster'
  and external_id = '<ticketmaster-event-id>';
```

This affects only the requested Ticketmaster record. Run it from the Supabase SQL Editor or another trusted server-side administrative connection, then record the request and completion time. Do not store full raw Ticketmaster payloads; `listings` contains only normalized fields.
