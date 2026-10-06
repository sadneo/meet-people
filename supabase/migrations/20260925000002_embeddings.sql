-- ============================================
-- VEC SIMILARITY (must be first — everything else calls it)
-- ============================================
create or replace function vec_similarity(a double precision[], b double precision[])
returns double precision
language plpgsql
immutable
as $$
declare
  i   int;
  acc double precision := 0;
  n   int;
begin
  if a is null or b is null then
    return 0;
  end if;
  n := least(array_length(a, 1), array_length(b, 1));
  for i in 1..n loop
    acc := acc + a[i] * b[i];
  end loop;
  return greatest(0, least(1, acc));
end;
$$;

-- ============================================
-- CALL EDGE FUNCTION TO EMBED VIA GEMINI
-- ============================================
create or replace function get_gemini_embedding(interest_text text)
returns double precision[]
language plpgsql
security definer
as $$
declare
  resp extensions.http_response;
  embedding_arr double precision[];
  -- Replace with your actual anon key from `supabase status`
  anon_key text := 'YOUR_ANON_KEY_HERE';
begin
  resp := extensions.http((
    'POST',
    'http://host.docker.internal:54321/functions/v1/embed-interest',
    ARRAY[
      extensions.http_header('Content-Type', 'application/json'),
      -- API keys go in the 'apikey' header, NOT 'Authorization'
      extensions.http_header('apikey', anon_key)
    ],
    'application/json',
    jsonb_build_object('text', interest_text)::text
  )::extensions.http_request);

  if resp.status <> 200 then
    raise exception 'Embedding function returned status %: %', resp.status, resp.content;
  end if;

  embedding_arr := array(
    select elem::double precision
    from jsonb_array_elements_text((resp.content)::jsonb -> 'embedding') as elem
  );

  return embedding_arr;
end;
$$;

-- ============================================
-- TRIGGER: embed user interests on write
-- ============================================
create or replace function user_interests_embed()
returns trigger
language plpgsql
as $$
begin
  new.embedding := get_gemini_embedding(new.text);
  return new;
end;
$$;

create trigger trg_user_interests_embed
  before insert or update of text on user_interests
  for each row execute function user_interests_embed();

-- ============================================
-- USER INTEREST VECTOR (average of interest embeddings)
-- ============================================
create or replace function user_interest_vector(p_id uuid)
returns double precision[]
language plpgsql
stable
as $$
declare
  dim     constant int := 3072;
  avg     double precision[] := array_fill(0::double precision, array[dim]);
  cnt     int := 0;
  row_emb double precision[];
  i       int;
  norm    double precision := 0;
begin
  for row_emb in
    select embedding from user_interests
    where profile_id = p_id and embedding is not null
  loop
    cnt := cnt + 1;
    for i in 1..dim loop
      avg[i] := avg[i] + row_emb[i];
    end loop;
  end loop;

  if cnt = 0 then
    return avg;
  end if;

  for i in 1..dim loop
    avg[i] := avg[i] / cnt;
    norm := norm + avg[i] * avg[i];
  end loop;
  norm := sqrt(norm);
  if norm > 0 then
    for i in 1..dim loop
      avg[i] := avg[i] / norm;
    end loop;
  end if;

  return avg;
end;
$$;

-- ============================================
-- PROFILE TEXT + EMBEDDING
-- ============================================
create or replace function profile_text(p_id uuid)
returns text
language sql
stable
as $$
  select
    coalesce(p.display_name, '') || ' ' ||
    coalesce(p.bio, '') || ' ' ||
    coalesce(p.location_city, '') || ' ' ||
    coalesce(
      (select string_agg(ui.text, ' ')
       from user_interests ui
       where ui.profile_id = p.id),
      ''
    ) || ' ' ||
    coalesce(
      (select string_agg(
         case a.dow
           when 0 then 'sunday'
           when 1 then 'monday'
           when 2 then 'tuesday'
           when 3 then 'wednesday'
           when 4 then 'thursday'
           when 5 then 'friday'
           when 6 then 'saturday'
         end, ' ')
       from availability a
       where a.profile_id = p.id),
      ''
    )
  from profiles p
  where p.id = p_id;
$$;

create or replace function profile_embedding(p_id uuid)
returns double precision[]
language sql
stable
as $$
  select get_gemini_embedding(profile_text(p_id));
$$;

-- ============================================
-- MEETUP EMBEDDING
-- ============================================
create or replace function meetup_embedding(m_id bigint)
returns double precision[]
language sql
stable
as $$
  select get_gemini_embedding(
    coalesce(m.title, '') || ' ' ||
    coalesce(m.description, '') || ' ' ||
    coalesce(m.category, '') || ' ' ||
    coalesce(m.location_name, '')
  )
  from meetups m
  where m.id = m_id;
$$;

-- ============================================
-- SHARED INTEREST LABELS
-- Uses vec_similarity, which is now defined at the top.
-- ============================================
create or replace function shared_interest_labels(user1 uuid, user2 uuid)
returns text[]
language sql
stable
as $$
  select coalesce(
    array_agg(distinct ui1.text order by ui1.text),
    array[]::text[]
  )
  from user_interests ui1
  join user_interests ui2 on ui2.profile_id = user2
  where ui1.profile_id = user1
    and ui1.embedding is not null
    and ui2.embedding is not null
    and vec_similarity(ui1.embedding, ui2.embedding) >= 0.65;
$$;