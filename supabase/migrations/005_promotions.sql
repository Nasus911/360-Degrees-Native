create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text not null check (char_length(trim(description)) > 0),
  product_id uuid references public.products(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.promotions enable row level security;

drop policy if exists "promotions are readable by signed in users" on public.promotions;
drop policy if exists "admins manage promotions" on public.promotions;

create policy "promotions are readable by signed in users"
on public.promotions for select to authenticated
using (true);

create policy "admins manage promotions"
on public.promotions for all to authenticated
using (public.is_admin())
with check (public.is_admin());