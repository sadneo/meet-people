-- A complete dated snapshot replaces its item array on refresh, so removed dishes
-- do not survive an otherwise successful import. Menus are separate from events.
create table public.dining_menus (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('nutrislice_sbu', 'sbu_hospital')),
  external_id text not null check (length(btrim(external_id)) > 0),
  location_slug text not null check (length(btrim(location_slug)) > 0),
  location_name text not null check (length(btrim(location_name)) > 0),
  menu_slug text not null check (length(btrim(menu_slug)) > 0),
  menu_name text not null check (length(btrim(menu_name)) > 0),
  menu_date date not null,
  source_url text not null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  notices jsonb not null default '[]'::jsonb check (jsonb_typeof(notices) = 'array'),
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dining_menus_source_external_id_key unique (source, external_id),
  constraint dining_menus_location_menu_date_key unique (source, location_slug, menu_slug, menu_date)
);

create index dining_menus_date_location_idx on public.dining_menus (menu_date, source, location_slug);
create trigger set_dining_menus_updated_at before update on public.dining_menus
for each row execute function public.set_updated_at();

alter table public.dining_menus enable row level security;
revoke all on table public.dining_menus from public, anon, authenticated;
grant select, insert, update, delete on table public.dining_menus to service_role;
