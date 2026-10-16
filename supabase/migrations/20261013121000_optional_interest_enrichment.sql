-- Interest labels are account data; embeddings are optional derived data.
-- Preserve a working provider but never lose a profile save to provider downtime.
create or replace function public.user_interests_embed()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  begin
    -- ponytail: synchronous enrichment capped at two seconds per label;
    -- move enrichment to a background job when provider latency matters.
    perform set_config('http.curlopt_timeout_ms','2000',true);
    new.embedding := public.get_gemini_embedding(new.text);
  exception when others then
    new.embedding := null;
    raise warning 'Interest saved without optional embedding';
  end;
  return new;
end;
$$;
