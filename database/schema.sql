-- ============================================================
-- SUG E-Commerce Fraud Detection System - Supabase Schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ---------- Profiles (extends Supabase auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  is_admin boolean default false,
  account_created_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- Products ----------
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  price numeric(12,2) not null check (price > 0),
  image_url text,
  category text,
  stock int not null default 0 check (stock >= 0),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- Orders ----------
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','paid','review','blocked','failed','shipped','delivered','cancelled')),
  total_amount numeric(12,2) not null,
  shipping_address text,
  shipping_country text,
  billing_country text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null
);

-- ---------- Transactions (payment attempts) ----------
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id),
  paystack_reference text unique,
  amount numeric(12,2) not null,
  payment_method text,
  ip_address text,
  device_fingerprint text,
  status text not null default 'initiated' check (status in ('initiated','success','failed','abandoned')),
  created_at timestamptz default now()
);

-- ---------- Fraud detection logs ----------
create table if not exists public.fraud_logs (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid references public.transactions(id) on delete cascade,
  order_id uuid references public.orders(id),
  user_id uuid references auth.users(id),
  ml_probability numeric(6,4),
  rule_score numeric(6,4),
  final_score numeric(6,4),
  decision text check (decision in ('APPROVE','REVIEW','BLOCK')),
  reasons jsonb,
  raw_features jsonb,
  created_at timestamptz default now()
);

-- ---------- Blacklist (feeds the rules engine) ----------
create table if not exists public.blacklist (
  id uuid primary key default uuid_generate_v4(),
  type text check (type in ('email','ip','card_bin')),
  value text not null,
  reason text,
  created_at timestamptz default now(),
  unique(type, value)
);

-- ---------- User behavioral aggregates (for velocity / deviation features) ----------
create table if not exists public.user_transaction_stats (
  user_id uuid primary key references auth.users(id),
  avg_amount numeric(12,2) default 0,
  txn_count_total int default 0,
  last_country text,
  last_lat double precision,
  last_lng double precision,
  last_device_fingerprint text,
  last_transaction_at timestamptz
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transactions enable row level security;
alter table public.fraud_logs enable row level security;
alter table public.profiles enable row level security;

-- Everyone can view active products
create policy "Public can view active products" on public.products
  for select using (is_active = true);

-- Users manage only their own orders
create policy "Users view own orders" on public.orders
  for select using (auth.uid() = user_id);
create policy "Users create own orders" on public.orders
  for insert with check (auth.uid() = user_id);

create policy "Users view own order items" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

create policy "Users view own transactions" on public.transactions
  for select using (auth.uid() = user_id);

create policy "Users view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

-- fraud_logs: no public policy -> only accessible via service_role key (backend)

-- ============================================================
-- Seed sample products
-- ============================================================
insert into public.products (name, description, price, image_url, category, stock) values
('Wireless Bluetooth Earbuds', 'Noise-cancelling earbuds with 24hr battery life', 15500.00, 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df', 'Electronics', 50),
('Smart Fitness Watch', 'Heart-rate & sleep tracking, 7-day battery', 32000.00, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30', 'Electronics', 30),
('Men''s Leather Sneakers', 'Genuine leather, breathable design', 21000.00, 'https://images.unsplash.com/photo-1549298916-b41d501d3772', 'Fashion', 40),
('Women''s Handbag', 'Premium faux-leather tote bag', 18500.00, 'https://images.unsplash.com/photo-1584917865442-de89df76afd3', 'Fashion', 25),
('Portable Bluetooth Speaker', '360-degree sound, waterproof', 12500.00, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1', 'Electronics', 60),
('Office Chair (Ergonomic)', 'Adjustable lumbar support, mesh back', 45000.00, 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8', 'Furniture', 15)
on conflict do nothing;
