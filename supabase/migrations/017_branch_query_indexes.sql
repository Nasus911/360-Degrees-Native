create index if not exists orders_branch_created_at_idx
  on public.orders(branch_id, created_at desc);

create index if not exists orders_customer_created_at_idx
  on public.orders(customer_id, created_at desc);

create index if not exists profiles_branch_full_name_idx
  on public.profiles(branch_id, full_name)
  where branch_id is not null;

create index if not exists inventory_branch_name_idx
  on public.inventory(branch_id, name);

create index if not exists activity_logs_branch_created_at_idx
  on public.activity_logs(branch_id, created_at desc);

create index if not exists stock_movements_branch_created_at_idx
  on public.stock_movements(branch_id, created_at desc);

create index if not exists inventory_transfers_from_created_at_idx
  on public.inventory_transfers(from_branch_id, created_at desc);

create index if not exists inventory_transfers_to_created_at_idx
  on public.inventory_transfers(to_branch_id, created_at desc);

create index if not exists notifications_unread_user_created_at_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;
