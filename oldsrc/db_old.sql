-- Run this in your Supabase SQL editor to set up the Blokbar database

-- Users (presence + study time)
create table if not exists blokbar_users (
  id text primary key,
  name text not null,
  studying boolean default false,
  study_seconds integer default 0,
  last_seen timestamptz default now()
);
alter table blokbar_users enable row level security;
create policy "Allow all" on blokbar_users for all using (true) with check (true);

-- Timers
create table if not exists blokbar_timers (
  id text primary key,
  label text not null,
  ends_at timestamptz not null,
  owner_id text,
  owner_name text
);
alter table blokbar_timers enable row level security;
create policy "Allow all" on blokbar_timers for all using (true) with check (true);

-- Playlist
create table if not exists blokbar_playlist (
  id text primary key,
  url text not null,
  title text,
  added_by text,
  sort_order bigint default 0
);
alter table blokbar_playlist enable row level security;
create policy "Allow all" on blokbar_playlist for all using (true) with check (true);

-- Activities (break wheel)
create table if not exists blokbar_activities (
  id text primary key,
  label text not null,
  created_by text
);
alter table blokbar_activities enable row level security;
create policy "Allow all" on blokbar_activities for all using (true) with check (true);

-- Shared state (mute, playlist index, spin)
create table if not exists blokbar_state (
  key text primary key,
  value text
);
alter table blokbar_state enable row level security;
create policy "Allow all" on blokbar_state for all using (true) with check (true);

-- Insert some starter activities
insert into blokbar_activities (id, label, created_by) values
  ('act1', 'Ga een wandeling maken 🚶', 'starter'),
  ('act2', 'Maak een kop thee ☕', 'starter'),
  ('act3', 'Speel NYT Wordle 🟩', 'starter'),
  ('act4', 'Trek even buiten frisse lucht 🌿', 'starter'),
  ('act5', 'Doe 10 push-ups 💪', 'starter'),
  ('act6', 'Bel iemand die je al lang niet gesproken hebt 📞', 'starter')
on conflict (id) do nothing;

-- Enable realtime for all tables
alter publication supabase_realtime add table blokbar_users;
alter publication supabase_realtime add table blokbar_timers;
alter publication supabase_realtime add table blokbar_playlist;
alter publication supabase_realtime add table blokbar_activities;
alter publication supabase_realtime add table blokbar_state;
