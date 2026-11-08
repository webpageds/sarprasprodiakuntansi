-- SIM-SPA Prodi Akuntansi
-- Jalankan melalui Supabase SQL Editor. Seluruh tabel aplikasi dilindungi RLS.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text not null default '',
  role text not null default 'dosen' check (role in ('admin','pimpinan','dosen','petugas')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username, full_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'username',''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.email,''),'@',1)),
    'dosen'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_simspa on auth.users;
create trigger on_auth_user_created_simspa
after insert on auth.users
for each row execute procedure public.bootstrap_profile();

create or replace function public.current_simspa_role()
returns text language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.simspa_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_simspa_role() = 'admin', false)
$$;

create or replace function public.simspa_is_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_simspa_role() in ('admin','pimpinan'), false)
$$;

create or replace function public.simspa_is_active_user()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active = true)
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_type text not null default 'Lainnya',
  person_in_charge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  category text not null,
  room_id uuid references public.rooms(id) on delete set null,
  condition text not null default 'Baik' check (condition in ('Baik','Rusak Ringan','Rusak Sedang','Rusak Berat','Tidak Dapat Digunakan')),
  status text not null default 'Aktif' check (status in ('Aktif','Dipinjam','Diperbaiki','Dihapus')),
  acquisition_year integer,
  acquisition_value numeric(16,2) not null default 0,
  useful_life_years integer not null default 5 check (useful_life_years > 0),
  acquisition_source text,
  serial_number text,
  person_in_charge text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null,
  quantity numeric(14,2) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(14,2) not null default 0 check (minimum_quantity >= 0),
  storage_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('Masuk','Keluar')),
  quantity numeric(14,2) not null check (quantity > 0),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.apply_stock_transaction()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.transaction_type = 'Keluar' then
    update public.stock_items
      set quantity = quantity - new.quantity, updated_at = now()
      where id = new.stock_item_id and quantity >= new.quantity;
    if not found then raise exception 'Stok tidak cukup atau barang tidak ditemukan'; end if;
  else
    update public.stock_items
      set quantity = quantity + new.quantity, updated_at = now()
      where id = new.stock_item_id;
    if not found then raise exception 'Barang persediaan tidak ditemukan'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_transaction_apply on public.stock_transactions;
create trigger stock_transaction_apply
before insert on public.stock_transactions
for each row execute procedure public.apply_stock_transaction();

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  borrower_id uuid not null references auth.users(id) on delete restrict,
  borrower_name text not null,
  loan_date date not null,
  planned_return_date date not null,
  actual_return_date date,
  purpose text not null,
  status text not null default 'Diajukan' check (status in ('Diajukan','Disetujui','Ditolak','Dipinjam','Dikembalikan')),
  return_condition text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_return_date >= loan_date)
);

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  description text not null,
  report_date date not null default current_date,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_name text,
  action_taken text,
  status text not null default 'Dilaporkan' check (status in ('Dilaporkan','Diproses','Menunggu suku cadang','Selesai','Tidak dapat diperbaiki')),
  final_condition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_mutations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  from_room_id uuid references public.rooms(id) on delete set null,
  to_room_id uuid not null references public.rooms(id) on delete restrict,
  proposed_by uuid references auth.users(id) on delete set null,
  new_person_in_charge text,
  reason text not null,
  proposal_date date not null default current_date,
  status text not null default 'Diusulkan' check (status in ('Diusulkan','Disetujui','Ditolak')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_disposals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  proposed_by uuid references auth.users(id) on delete set null,
  reason text not null,
  proposal_date date not null default current_date,
  status text not null default 'Diusulkan' check (status in ('Diusulkan','Disetujui','Ditolak')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cleaning_records (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  record_type text not null check (record_type in ('cek','keluhan')),
  record_date date not null default current_date,
  result text,
  notes text,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_name text,
  is_resolved boolean not null default false,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_role text,
  activity text not null,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.assets enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.loans enable row level security;
alter table public.repairs enable row level security;
alter table public.asset_mutations enable row level security;
alter table public.asset_disposals enable row level security;
alter table public.cleaning_records enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists profiles_read_self_or_management on public.profiles;
create policy profiles_read_self_or_management on public.profiles for select to authenticated
using (id = auth.uid() or public.simspa_is_manager());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.simspa_is_admin()) with check (public.simspa_is_admin());

drop policy if exists rooms_read_active on public.rooms;
create policy rooms_read_active on public.rooms for select to authenticated using (public.simspa_is_active_user());
drop policy if exists rooms_manage on public.rooms;
create policy rooms_manage on public.rooms for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());

drop policy if exists assets_read_active on public.assets;
create policy assets_read_active on public.assets for select to authenticated using (public.simspa_is_active_user());
drop policy if exists assets_manage on public.assets;
create policy assets_manage on public.assets for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());

drop policy if exists stock_items_manager on public.stock_items;
create policy stock_items_manager on public.stock_items for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());
drop policy if exists stock_transactions_manager on public.stock_transactions;
create policy stock_transactions_manager on public.stock_transactions for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());

drop policy if exists loans_manager_all on public.loans;
create policy loans_manager_all on public.loans for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());
drop policy if exists loans_dosen_read_own on public.loans;
create policy loans_dosen_read_own on public.loans for select to authenticated using (borrower_id = auth.uid());
drop policy if exists loans_dosen_create_own on public.loans;
create policy loans_dosen_create_own on public.loans for insert to authenticated with check (borrower_id = auth.uid() and public.current_simspa_role() = 'dosen');

drop policy if exists repairs_manager_all on public.repairs;
create policy repairs_manager_all on public.repairs for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());
drop policy if exists repairs_dosen_read_own on public.repairs;
create policy repairs_dosen_read_own on public.repairs for select to authenticated using (reporter_id = auth.uid());
drop policy if exists repairs_dosen_create on public.repairs;
create policy repairs_dosen_create on public.repairs for insert to authenticated with check (reporter_id = auth.uid() and public.current_simspa_role() = 'dosen');
drop policy if exists repairs_petugas_read on public.repairs;
create policy repairs_petugas_read on public.repairs for select to authenticated using (public.current_simspa_role() = 'petugas');
drop policy if exists repairs_petugas_update on public.repairs;
create policy repairs_petugas_update on public.repairs for update to authenticated using (public.current_simspa_role() = 'petugas') with check (public.current_simspa_role() = 'petugas');

drop policy if exists mutations_manager on public.asset_mutations;
create policy mutations_manager on public.asset_mutations for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());
drop policy if exists disposals_manager on public.asset_disposals;
create policy disposals_manager on public.asset_disposals for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());

drop policy if exists cleaning_manager_all on public.cleaning_records;
create policy cleaning_manager_all on public.cleaning_records for all to authenticated using (public.simspa_is_manager()) with check (public.simspa_is_manager());
drop policy if exists cleaning_dosen_read_own on public.cleaning_records;
create policy cleaning_dosen_read_own on public.cleaning_records for select to authenticated using (reporter_id = auth.uid());
drop policy if exists cleaning_dosen_complaint on public.cleaning_records;
create policy cleaning_dosen_complaint on public.cleaning_records for insert to authenticated with check (reporter_id = auth.uid() and public.current_simspa_role() = 'dosen' and record_type = 'keluhan');
drop policy if exists cleaning_petugas_read on public.cleaning_records;
create policy cleaning_petugas_read on public.cleaning_records for select to authenticated using (public.current_simspa_role() = 'petugas');
drop policy if exists cleaning_petugas_insert_update on public.cleaning_records;
create policy cleaning_petugas_insert_update on public.cleaning_records for insert to authenticated with check (public.current_simspa_role() = 'petugas' and reporter_id = auth.uid());
drop policy if exists cleaning_petugas_update on public.cleaning_records;
create policy cleaning_petugas_update on public.cleaning_records for update to authenticated using (public.current_simspa_role() = 'petugas') with check (public.current_simspa_role() = 'petugas');

drop policy if exists activity_logs_insert_self on public.activity_logs;
create policy activity_logs_insert_self on public.activity_logs for insert to authenticated
with check (user_id = auth.uid());
drop policy if exists activity_logs_manager_read on public.activity_logs;
create policy activity_logs_manager_read on public.activity_logs for select to authenticated
using (public.simspa_is_manager());

create index if not exists assets_room_idx on public.assets(room_id);
create index if not exists loans_borrower_idx on public.loans(borrower_id);
create index if not exists loans_status_idx on public.loans(status);
create index if not exists repairs_asset_idx on public.repairs(asset_id);
create index if not exists cleaning_room_date_idx on public.cleaning_records(room_id, record_date desc);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.assets; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.loans; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.repairs; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.stock_items; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.cleaning_records; exception when duplicate_object then null; end;
  end if;
end $$;
