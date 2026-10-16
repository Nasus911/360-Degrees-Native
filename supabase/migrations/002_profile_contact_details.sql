alter table public.profiles
  add column if not exists contact_number text,
  add column if not exists address text;