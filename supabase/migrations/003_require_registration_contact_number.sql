create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_contact_number text := nullif(trim(new.raw_user_meta_data->>'contact_number'), '');
begin
  if new_contact_number is null then
    raise exception 'Contact number is required.';
  end if;

  insert into public.profiles (id, full_name, email, role, contact_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'customer',
    new_contact_number
  );
  return new;
end;
$$;