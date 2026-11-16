begin;

-- Keep the first image in the original column so avatars, eligibility and
-- installed clients continue to read the same primary photo and revision.
alter table photo_private.photos add column extra_jpegs bytea[] not null default '{}';
alter table photo_private.photos add constraint profile_photo_gallery_size
  check (cardinality(extra_jpegs) <= 3 and (jpeg is not null or cardinality(extra_jpegs) = 0));
alter table photo_private.requests add column gallery_action text;

create function photo_private.gallery_state(owner_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce((
    select jsonb_build_object('revision', revision, 'count',
      case when jpeg is null then 0 else 1 + cardinality(extra_jpegs) end)
    from photo_private.photos where user_id=owner_id
  ), '{"revision":0,"count":0}'::jsonb)
$$;
revoke all on function photo_private.gallery_state(uuid) from public,anon,authenticated;

create function public.get_profile_photo_gallery(owner_in uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  -- The existing reference call locks and verifies the current photo audience.
  perform public.get_profile_photo_reference(owner_in);
  return photo_private.gallery_state(owner_in);
end $$;

create function public.read_profile_photo_slot(owner_in uuid, revision_in bigint, position_in integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare bytes bytea; state jsonb;
begin
  state := public.get_profile_photo_gallery(owner_in);
  if position_in is null or position_in not between 1 and 4 or revision_in is null
     or revision_in <> (state->>'revision')::bigint then
    raise exception 'Photo unavailable' using errcode='PT404';
  end if;
  select case when position_in=1 then jpeg else extra_jpegs[position_in-1] end
    into bytes from photo_private.photos where user_id=owner_in;
  if bytes is null then raise exception 'Photo unavailable' using errcode='PT404'; end if;
  return jsonb_build_object('revision',revision_in,'jpegBase64',encode(bytes,'base64'));
end $$;

create function public.edit_profile_photo_gallery(edit_in jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := safety_private.actor();
  operation text := edit_in->>'action';
  expected bigint;
  request_key uuid;
  fingerprint bytea;
  prior photo_private.requests;
  existing photo_private.photos;
  images bytea[];
  bytes bytea;
  position_in integer;
  target_position integer;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'READ COMMITTED required' using errcode='25001';
  end if;
  if jsonb_typeof(edit_in) is distinct from 'object'
     or jsonb_typeof(edit_in->'expectedRevision') is distinct from 'number'
     or not coalesce(location_private.valid_uuid(edit_in->>'requestId'),false)
     or operation is null or operation not in ('append','move','remove')
     or (operation='append' and (jsonb_typeof(edit_in->'jpegBase64') is distinct from 'string'
       or char_length(edit_in->>'jpegBase64')>349528
       or edit_in - array['action','expectedRevision','requestId','jpegBase64'] <> '{}'))
     or (operation in ('move','remove') and (jsonb_typeof(edit_in->'position') is distinct from 'number'
       or edit_in->>'position' not in ('1','2','3','4')))
     or (operation='remove' and edit_in - array['action','expectedRevision','requestId','position'] <> '{}')
     or (operation='move' and (jsonb_typeof(edit_in->'toPosition') is distinct from 'number'
       or edit_in->>'toPosition' not in ('1','2','3','4')
       or edit_in - array['action','expectedRevision','requestId','position','toPosition'] <> '{}'))
     or (edit_in->>'expectedRevision')::numeric not between 0 and 9007199254740990
     or trunc((edit_in->>'expectedRevision')::numeric)<>(edit_in->>'expectedRevision')::numeric then
    raise exception 'Invalid gallery edit' using errcode='22023';
  end if;
  expected := (edit_in->>'expectedRevision')::bigint;
  request_key := (edit_in->>'requestId')::uuid;
  fingerprint := sha256(convert_to(edit_in::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('pebble.photo.owner.v1:'||actor::text,0));
  select * into existing from photo_private.photos where user_id=actor for update;
  select * into prior from photo_private.requests where user_id=actor and request_id=request_key;
  if found then
    if prior.fingerprint<>fingerprint or existing.revision is distinct from prior.revision then
      raise exception 'Gallery changed' using errcode='PH409';
    end if;
    return photo_private.gallery_state(actor);
  end if;
  if coalesce(existing.revision,0)<>expected then
    raise exception 'Gallery changed' using errcode='PH409';
  end if;
  images := case when existing.jpeg is null then '{}'::bytea[] else array_prepend(existing.jpeg,existing.extra_jpegs) end;
  if operation='append' then
    if cardinality(images)>=4 then raise exception 'Gallery is full' using errcode='PH409'; end if;
    if (select count(*) from photo_private.requests where user_id=actor and has_photo and created_at>statement_timestamp()-interval '1 hour')>=5
       or (select count(*) from photo_private.requests where user_id=actor and has_photo and created_at>statement_timestamp()-interval '24 hours')>=20 then
      raise exception 'Photo upload limit' using errcode='PH429';
    end if;
    begin bytes := decode(edit_in->>'jpegBase64','base64');
    exception when data_exception then raise exception 'Invalid photo encoding' using errcode='22023'; end;
    if not photo_private.valid_jpeg(bytes) then raise exception 'Invalid photo' using errcode='22023'; end if;
    images := array_append(images,bytes);
  else
    position_in := (edit_in->>'position')::integer;
    if position_in>cardinality(images) then raise exception 'Photo unavailable' using errcode='PH409'; end if;
    if operation='move' then
      if (select count(*) from photo_private.requests where user_id=actor and gallery_action='move' and created_at>statement_timestamp()-interval '1 hour')>=40 then
        raise exception 'Photo move limit' using errcode='PH429';
      end if;
      target_position := (edit_in->>'toPosition')::integer;
      if target_position>cardinality(images) or target_position=position_in then
        raise exception 'Invalid move' using errcode='22023';
      end if;
      bytes := images[position_in];
      images := images[1:position_in-1] || images[position_in+1:cardinality(images)];
      images := images[1:target_position-1] || array[bytes] || images[target_position:cardinality(images)];
    else
      images := images[1:position_in-1] || images[position_in+1:cardinality(images)];
    end if;
  end if;
  insert into photo_private.photos(user_id,revision,jpeg,extra_jpegs)
    values(actor,expected+1,images[1],images[2:4])
    on conflict(user_id) do update set revision=excluded.revision,jpeg=excluded.jpeg,
      extra_jpegs=excluded.extra_jpegs,updated_at=statement_timestamp();
  insert into photo_private.requests(user_id,request_id,fingerprint,revision,has_photo,gallery_action)
    values(actor,request_key,fingerprint,expected+1,operation='append',operation);
  return photo_private.gallery_state(actor);
end $$;

revoke all on function public.get_profile_photo_gallery(uuid), public.read_profile_photo_slot(uuid,bigint,integer), public.edit_profile_photo_gallery(jsonb) from public,anon,authenticated;
grant execute on function public.get_profile_photo_gallery(uuid), public.read_profile_photo_slot(uuid,bigint,integer), public.edit_profile_photo_gallery(jsonb) to authenticated;
commit;
