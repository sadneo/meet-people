-- Imported events use UUID listings; Winso's matcher uses bigint meetups.
-- No backfill, invented host, ingestion change or replacement ranking.
create table public.listing_matchmaking_links (
 listing_id uuid primary key references public.listings(id) on delete cascade,
 meetup_id bigint not null unique references public.meetups(id) on delete restrict
);
alter table public.listing_matchmaking_links enable row level security;
revoke all on public.listing_matchmaking_links from public,anon,authenticated;
grant select,insert,update,delete on public.listing_matchmaking_links to service_role;

create function public.get_listing_matchmaking_status(listing_id_in uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); l public.listings%rowtype; interested boolean;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 select * into l from public.listings where id=listing_id_in and listing_type='event';
 if not found then raise exception 'Event not found' using errcode='PT404'; end if;
 select exists(select 1 from public.listing_matchmaking_links b join public.event_interest i on i.meetup_id=b.meetup_id where b.listing_id=l.id and i.profile_id=actor) into interested;
 return jsonb_build_object('isInterested',interested,'available',coalesce(l.status in ('active','rescheduled') and l.starts_at>now(),false));
end $$;

create function public.express_listing_matchmaking_interest(listing_id_in uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); l public.listings%rowtype; mid bigint;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 select * into l from public.listings where id=listing_id_in and listing_type='event' for update;
 if not found then raise exception 'Event not found' using errcode='PT404'; end if;
 if not coalesce(l.status in ('active','rescheduled') and l.starts_at>now(),false) then raise exception 'Event unavailable' using errcode='PT409'; end if;
 perform 1 from public.profiles where id=actor and is_active for share;
 if not found then raise exception 'Save matching profile first' using errcode='PT409'; end if;
 select meetup_id into mid from public.listing_matchmaking_links where listing_id=l.id;
 if mid is null then
  insert into public.meetups(host_id,title,description,category,location_name,latitude,longitude,starts_at,ends_at,is_public)
  values(null,l.title,l.description,l.category,l.location_name,l.latitude,l.longitude,l.starts_at,l.ends_at,true) returning id into mid;
  insert into public.listing_matchmaking_links(listing_id,meetup_id) values(l.id,mid);
 else
  update public.meetups set title=l.title,description=l.description,category=l.category,location_name=l.location_name,latitude=l.latitude,longitude=l.longitude,starts_at=l.starts_at,ends_at=l.ends_at,is_public=true where id=mid and host_id is null;
  if not found then raise exception 'Imported event link requires repair' using errcode='PT409'; end if;
 end if;
 insert into public.event_interest(meetup_id,profile_id) values(mid,actor) on conflict(meetup_id,profile_id) do nothing;
 return public.get_listing_matchmaking_status(l.id);
end $$;

create function public.withdraw_listing_matchmaking_interest(listing_id_in uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); l public.listings%rowtype;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 select * into l from public.listings where id=listing_id_in and listing_type='event' for update;
 if not found then raise exception 'Event not found' using errcode='PT404'; end if;
 delete from public.event_interest i using public.listing_matchmaking_links b where b.listing_id=l.id and i.meetup_id=b.meetup_id and i.profile_id=actor;
 return public.get_listing_matchmaking_status(l.id);
end $$;

create function public.get_listing_event_matches(listing_id_in uuid)
returns table(profile_id uuid,username text,display_name text,avatar_url text,bio text,note text,shared_interests text[],match_score numeric)
language plpgsql stable security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); l public.listings%rowtype; m public.meetups%rowtype;
begin
 if actor is null then raise exception 'Not authenticated' using errcode='28000'; end if;
 select * into l from public.listings where id=listing_id_in and listing_type='event';
 if not found then raise exception 'Event not found' using errcode='PT404'; end if;
 if not coalesce(l.status in ('active','rescheduled') and l.starts_at>now(),false) then raise exception 'Event unavailable' using errcode='PT409'; end if;
 if not exists(select 1 from public.profiles where id=actor and is_active) then raise exception 'Save matching profile first' using errcode='PT409'; end if;
 select mt.* into m from public.meetups mt join public.listing_matchmaking_links b on b.meetup_id=mt.id where b.listing_id=l.id;
 if not found or not exists(select 1 from public.event_interest i where i.meetup_id=m.id and i.profile_id=actor) then raise exception 'Opt in first' using errcode='PT409'; end if;
 if m.host_id is not null or not m.is_public or
 row(m.title,m.description,m.category,m.location_name,m.latitude,m.longitude,m.starts_at,m.ends_at) is distinct from
 row(l.title,l.description,l.category,l.location_name,l.latitude,l.longitude,l.starts_at,l.ends_at) then
 raise exception 'Event changed; refresh opt-in' using errcode='PT409'; end if;
 -- Legacy algorithm helpers use unqualified names: only a trusted public schema.
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'Unsafe schema' using errcode='42501'; end if;
 perform set_config('search_path','pg_catalog, public',true);
 return query select * from public.get_event_matches(m.id);
end $$;

revoke all on function public.get_listing_matchmaking_status(uuid) from public,anon;
revoke all on function public.express_listing_matchmaking_interest(uuid) from public,anon;
revoke all on function public.withdraw_listing_matchmaking_interest(uuid) from public,anon;
revoke all on function public.get_listing_event_matches(uuid) from public,anon;
grant execute on function public.get_listing_matchmaking_status(uuid) to authenticated;
grant execute on function public.express_listing_matchmaking_interest(uuid) to authenticated;
grant execute on function public.withdraw_listing_matchmaking_interest(uuid) to authenticated;
grant execute on function public.get_listing_event_matches(uuid) to authenticated;
