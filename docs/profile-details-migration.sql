-- REVIEW CANDIDATE ONLY. Authored, NOT applied or SQL-executed by the agent.
-- Parent-only installation after independent network-none database acceptance.
-- Requires auth.users, auth.uid(), anon/authenticated roles and trusted DDL owner.
-- Separate from the account document: no legacy writer, matcher or provider calls.
-- No public projection: broader discovery/block privacy enforcement is unresolved.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if current_setting('server_encoding') <> 'UTF8' then
    raise exception 'Profile details require UTF8' using errcode='22023';
  end if;
end $$;

-- Pebble comparison v1, byte-exact after fixed whitespace/case mapping. This is
-- NOT full Unicode case folding. Unlisted scalars are unchanged; all valid
-- scalar labels remain supported. No locale casing/regex or normalization.
create function public.profile_language_key(value_in text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  fold_ranges constant jsonb := '[[65,90,1,32],[192,214,1,32],[216,222,1,32],[256,302,2,1],[306,310,2,1],[313,327,2,1],[330,374,2,1],[377,381,2,1],[461,475,2,1],[478,494,2,1],[498,500,2,1],[504,542,2,1],[546,562,2,1],[913,929,1,32],[931,939,1,32],[1024,1039,1,80],[1040,1071,1,32],[1120,1152,2,1],[1162,1214,2,1],[1217,1229,2,1],[1232,1326,2,1],[1329,1366,1,48],[7680,7828,2,1],[7840,7934,2,1],[65313,65338,1,32],[66560,66599,1,40],[66736,66771,1,40],[68736,68786,1,64],[71840,71871,1,32],[93760,93791,1,32],[125184,125217,1,34]]';
  fold_exceptions constant jsonb := '{"181":"μ","223":"ss","304":"i\u0307","376":"ÿ","383":"s","902":"ά","904":"έ","905":"ή","906":"ί","908":"ό","910":"ύ","911":"ώ","962":"σ","976":"β","977":"θ","981":"φ","982":"π","1008":"κ","1009":"ρ","1013":"ε","7838":"ss","8486":"ω","8490":"k","8491":"å"}';
  whitespace_points constant jsonb := '[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]';
  spaces text := ''; clean text; result text := ''; item jsonb; point integer;
  mapped integer; exception_in text; position_in integer;
begin
  if value_in is null then return null; end if;
  for item in select value from jsonb_array_elements(whitespace_points) loop
    spaces := spaces || chr((item #>> '{}')::integer);
  end loop;
  clean := btrim(value_in, spaces);
  for position_in in 1..char_length(clean) loop
    point := ascii(substr(clean,position_in,1));
    exception_in := fold_exceptions->>point::text;
    if exception_in is not null then result := result || exception_in; continue; end if;
    mapped := point;
    for item in select value from jsonb_array_elements(fold_ranges) loop
      if point between (item->>0)::integer and (item->>1)::integer
        and (point - (item->>0)::integer) % (item->>2)::integer = 0 then
        mapped := point + (item->>3)::integer; exit;
      end if;
    end loop;
    result := result || chr(mapped);
  end loop;
  return result;
end $$;
revoke all on function public.profile_language_key(text) from public, anon, authenticated;

-- Paired with the TypeScript corpus. These assertions execute ONLY if the
-- parent installs the candidate; static Vitest parsing is not SQL evidence.
do $$
declare
  key_corpus constant jsonb := '[["\uFEFF English\u00A0","english"],["\u00A0\uFEFF",""],["I","i"],["i","i"],["İ","i\u0307"],["ı","ı"],["ΟΣ","οσ"],["ος","οσ"],["οσ","οσ"],["FRANÇAIS","français"],["РУССКИЙ","русский"],["日本語","日本語"],["𐐀𐐨😀","𐐨𐐨😀"],["Straße","strasse"],["STRASSE","strasse"],["é","é"],["e\u0301","e\u0301"],["\u0085English\u0085","\u0085english\u0085"],["\u200BEnglish\u200B","\u200Benglish\u200B"],["Ꭰꭰ","Ꭰꭰ"]]';
  pair jsonb;
begin
  for pair in select value from jsonb_array_elements(key_corpus) loop
    if (public.profile_language_key(pair->>0) collate "C") is distinct from ((pair->>1) collate "C") then
      raise exception 'Profile language key corpus failed' using errcode='22023';
    end if;
  end loop;
end $$;

create function public.valid_profile_facts(facts_in jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; label text; seen text[] := '{}'::text[]; visibility_in jsonb;
begin
  if jsonb_typeof(facts_in) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(facts_in)) <> 4
    or not facts_in ?& array['education','occupation','languages','visibility'] then return false; end if;
  if jsonb_typeof(facts_in->'education') is distinct from 'string'
    or jsonb_typeof(facts_in->'occupation') is distinct from 'string'
    or char_length(facts_in->>'education') > 120
    or char_length(facts_in->>'occupation') > 120
    or jsonb_typeof(facts_in->'languages') is distinct from 'array' then return false; end if;
  if jsonb_array_length(facts_in->'languages') > 12 then return false; end if;
  for item in select value from jsonb_array_elements(facts_in->'languages') loop
    if jsonb_typeof(item) is distinct from 'string' then return false; end if;
    -- Comparison key only: preserve exact stored values and their order.
    label := public.profile_language_key(item #>> '{}');
    if (label collate "C") = '' or char_length(item #>> '{}') > 60 or (label collate "C") = any(seen) then return false; end if;
    seen := array_append(seen, label);
  end loop;
  visibility_in := facts_in->'visibility';
  if jsonb_typeof(visibility_in) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(visibility_in)) <> 3
    or not visibility_in ?& array['education','occupation','languages'] then return false; end if;
  if exists(select 1 from jsonb_each(visibility_in) v where jsonb_typeof(v.value) is distinct from 'boolean') then return false; end if;
  return true;
end $$;
revoke all on function public.valid_profile_facts(jsonb) from public, anon, authenticated;

-- Deliberately no IF NOT EXISTS / CREATE OR REPLACE: fail rather than silently
-- adopting preexisting objects, owners or grants. Parent reviews collisions.
create table public.profile_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  facts jsonb not null check (public.valid_profile_facts(facts))
);
alter table public.profile_details enable row level security;
revoke all on public.profile_details from public, anon, authenticated;
-- No browser SELECT/DML grants or policies. Owner reads are RPC-only too.

create function public.get_profile_details()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select jsonb_build_object('revision',d.revision,'facts',d.facts) into result
    from public.profile_details d where d.user_id = actor;
  -- Revision zero is a virtual empty resource, not a write or fabricated fact.
  return coalesce(result, '{"revision":0,"facts":{"education":"","occupation":"","languages":[],"visibility":{"education":false,"occupation":false,"languages":false}}}'::jsonb);
end $$;
revoke all on function public.get_profile_details() from public, anon, authenticated;
grant execute on function public.get_profile_details() to authenticated;

create function public.save_profile_details(details_in jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); expected_revision bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Profile details writes require READ COMMITTED' using errcode='25001'; end if;
  if jsonb_typeof(details_in) is distinct from 'object' then
    raise exception 'Invalid profile details' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(details_in)) <> 2
    or not details_in ?& array['expectedRevision','facts']
    or jsonb_typeof(details_in->'expectedRevision') is distinct from 'number'
    or not public.valid_profile_facts(details_in->'facts') then
    raise exception 'Invalid profile details' using errcode='22023'; end if;
  if (details_in->>'expectedRevision')::numeric < 0
    or (details_in->>'expectedRevision')::numeric >= 9007199254740991
    or trunc((details_in->>'expectedRevision')::numeric) <> (details_in->>'expectedRevision')::numeric then
    raise exception 'Invalid or exhausted revision' using errcode='22023'; end if;
  expected_revision := (details_in->>'expectedRevision')::numeric::bigint;
  -- Concurrent initial inserts serialize on the actor primary key. The UPDATE
  -- then compares the current revision, never just a prior unlocked SELECT.
  insert into public.profile_details(user_id,revision,facts)
    values(actor,0,'{"education":"","occupation":"","languages":[],"visibility":{"education":false,"occupation":false,"languages":false}}'::jsonb)
    on conflict(user_id) do nothing;
  update public.profile_details set facts = details_in->'facts', revision = revision + 1
    where user_id = actor and revision = expected_revision;
  if not found then
    -- Exception rolls back even a just-inserted revision-zero row.
    raise exception 'Profile details revision conflict' using errcode='PD409';
  end if;
  return public.get_profile_details();
end $$;
revoke all on function public.save_profile_details(jsonb) from public, anon, authenticated;
grant execute on function public.save_profile_details(jsonb) to authenticated;
commit;
