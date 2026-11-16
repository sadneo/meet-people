-- Stand-in for the platform-owned Realtime schema in network-isolated schema
-- replay containers. WebSocket delivery is tested against the real local stack.
drop schema if exists realtime cascade;
create schema realtime;
create table realtime.messages (
  topic text not null, extension text not null, payload jsonb, event text, private boolean
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic', true);
$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql security definer as $$
  insert into realtime.messages values (topic, 'broadcast', payload || jsonb_build_object('id', gen_random_uuid()), event, private);
$$;
