create or replace function public.notify_head_admin_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_name text;
begin
  if tg_op = 'INSERT' then
    if new.quantity > new.low_stock_threshold then
      return new;
    end if;
  elsif old.quantity <= old.low_stock_threshold
    or new.quantity > new.low_stock_threshold then
    return new;
  end if;

  select name into v_branch_name from public.branches where id = new.branch_id;

  insert into public.notifications (user_id, title, message)
  select profile.id,
    'Low stock alert',
    format(
      '%s at %s has %s units remaining (low-stock threshold: %s).',
      new.name,
      coalesce(v_branch_name, 'Unknown branch'),
      new.quantity,
      new.low_stock_threshold
    )
  from public.profiles profile
  where profile.role in ('admin', 'head_admin')
    and profile.is_active = true;

  return new;
end;
$$;

drop trigger if exists inventory_low_stock_alert on public.inventory;
create trigger inventory_low_stock_alert
  after insert or update of quantity, low_stock_threshold on public.inventory
  for each row execute function public.notify_head_admin_low_stock();

insert into public.notifications (user_id, title, message)
select profile.id,
  'Low stock alert',
  format(
    '%s at %s has %s units remaining (low-stock threshold: %s).',
    inventory.name,
    branch.name,
    inventory.quantity,
    inventory.low_stock_threshold
  )
from public.inventory
join public.branches branch on branch.id = inventory.branch_id
cross join public.profiles profile
where inventory.quantity <= inventory.low_stock_threshold
  and profile.role in ('admin', 'head_admin')
  and profile.is_active = true;
