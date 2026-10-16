alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
alter table public.profiles alter column role set default 'customer';

alter table public.branches add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists customer_code text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.products add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.products add column if not exists unit_cost numeric(10, 2) not null default 0 check (unit_cost >= 0);
alter table public.products drop constraint if exists products_name_key;
create unique index if not exists products_global_name_idx on public.products(lower(name)) where branch_id is null;
create unique index if not exists products_branch_name_idx on public.products(branch_id, lower(name)) where branch_id is not null;

create sequence if not exists public.customer_code_seq;
update public.profiles
set customer_code = 'CS-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('public.customer_code_seq')::text, 4, '0')
where role = 'customer' and customer_code is null;
create unique index if not exists profiles_customer_code_idx on public.profiles(customer_code) where customer_code is not null;

create or replace function public.assign_customer_code()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.role = 'customer' and new.customer_code is null then
    new.customer_code := 'CS-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-' || lpad(nextval('public.customer_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists assign_customer_code on public.profiles;
create trigger assign_customer_code before insert or update of role on public.profiles
for each row execute function public.assign_customer_code();

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid references public.branches(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, branch_id)
);

alter table public.inventory add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.inventory add column if not exists unit_cost numeric(10, 2) not null default 0 check (unit_cost >= 0);
update public.inventory set branch_id = (select id from public.branches order by created_at limit 1) where branch_id is null;
alter table public.inventory alter column branch_id set not null;
alter table public.inventory drop constraint if exists inventory_sku_key;
create unique index if not exists inventory_branch_sku_idx on public.inventory(branch_id, sku);
create index if not exists inventory_branch_id_idx on public.inventory(branch_id);
insert into public.inventory (branch_id, product_id, name, sku, unit, quantity, low_stock_threshold, unit_cost)
select b.id, p.id, p.name, 'PRD-' || substr(p.id::text, 1, 8) || '-' || substr(b.id::text, 1, 4), 'unit',
  case p.name
    when 'Iced Spanish Latte' then 38 when 'Ube Cloud Latte' then 8 when 'Sea Salt Cold Brew' then 24
    when 'Flat White' then 31 when 'Calamansi Espresso' then 19 when 'Matcha Strawberry' then 14
    when 'Butter Croissant' then 17 when 'Banana Bread' then 12 else 0
  end,
  5, p.unit_cost
from public.branches b cross join public.products p
where p.category <> 'Inventory' and (p.branch_id is null or p.branch_id = b.id)
  and not exists (select 1 from public.inventory i where i.branch_id = b.id and i.product_id = p.id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  inventory_id uuid not null references public.inventory(id),
  quantity_delta integer not null check (quantity_delta <> 0),
  unit_cost numeric(10, 2) not null default 0 check (unit_cost >= 0),
  movement_type text not null check (movement_type in ('receipt', 'sale', 'promotion', 'adjustment', 'transfer_in', 'transfer_out')),
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid not null references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'completed')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_branch_id <> to_branch_id)
);
create table if not exists public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id),
  quantity integer not null check (quantity > 0),
  unique (transfer_id, inventory_id)
);

alter table public.promotions add column if not exists promo_type text not null default 'buy_x_get_y';
alter table public.promotions add column if not exists eligible_product_ids uuid[] not null default '{}';
alter table public.promotions add column if not exists free_product_id uuid references public.products(id) on delete set null;
alter table public.promotions add column if not exists buy_quantity integer not null default 1 check (buy_quantity > 0);
alter table public.promotions add column if not exists get_quantity integer not null default 1 check (get_quantity > 0);
alter table public.promotions add column if not exists discount_value numeric(10, 2) not null default 0 check (discount_value >= 0);
alter table public.promotions add column if not exists branch_ids uuid[] not null default '{}';
alter table public.promotions add column if not exists starts_at timestamptz;
alter table public.promotions add column if not exists ends_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promotions_promo_type_check') then
    alter table public.promotions add constraint promotions_promo_type_check
      check (promo_type in ('buy_x_get_y', 'percentage', 'fixed', 'bundle'));
  end if;
end;
$$;

alter table public.orders add column if not exists discount_total numeric(10, 2) not null default 0 check (discount_total >= 0);
alter table public.orders add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.order_items add column if not exists is_promo boolean not null default false;
alter table public.order_items add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.order_items add column if not exists discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0);
alter table public.reward_transactions add column if not exists transaction_type text not null default 'earned';
alter table public.reward_transactions add column if not exists expires_at timestamptz;
alter table public.reward_transactions add column if not exists source_transaction_id uuid references public.reward_transactions(id);
create unique index if not exists reward_transactions_order_once_idx on public.reward_transactions(order_id)
where order_id is not null and transaction_type = 'earned';
create unique index if not exists reward_transactions_expiration_once_idx on public.reward_transactions(source_transaction_id)
where transaction_type = 'expired' and source_transaction_id is not null;

create table if not exists public.loyalty_settings (
  id integer primary key default 1 check (id = 1),
  points_per_amount integer not null default 1 check (points_per_amount > 0),
  amount_per_point numeric(10, 2) not null default 100 check (amount_per_point > 0),
  expiration_days integer check (expiration_days is null or expiration_days > 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.loyalty_settings (id) values (1) on conflict (id) do nothing;
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  points_required integer not null check (points_required > 0),
  branch_id uuid references public.branches(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'head_admin')); $$;
create or replace function public.current_branch_id()
returns uuid language sql stable security definer set search_path = public
as $$ select branch_id from public.profiles where id = auth.uid(); $$;
create or replace function public.can_access_branch(target_branch_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_admin() or target_branch_id = public.current_branch_id(); $$;
create or replace function public.can_manage_branch(target_branch_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_admin() or exists (
  select 1 from public.profiles where id = auth.uid() and branch_id = target_branch_id
  and role in ('branch_admin', 'inventory_staff', 'staff')
); $$;

alter table public.product_categories enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;
alter table public.loyalty_settings enable row level security;
alter table public.rewards enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "profiles are readable by the owner or admin" on public.profiles;
create policy "profiles are readable by owner admin or branch" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin() or (branch_id = public.current_branch_id() and public.current_branch_id() is not null));
drop policy if exists "branches are readable by signed in users" on public.branches;
create policy "branches are readable by signed in users" on public.branches for select to authenticated using (true);
drop policy if exists "admins manage branches" on public.branches;
create policy "admins manage branches" on public.branches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff and admins read inventory" on public.inventory;
drop policy if exists "admins manage inventory" on public.inventory;
create policy "branch users read inventory" on public.inventory for select to authenticated using (public.can_access_branch(branch_id));
create policy "branch users manage inventory" on public.inventory for all to authenticated using (public.can_manage_branch(branch_id)) with check (public.can_manage_branch(branch_id));
drop policy if exists "staff and admins read orders" on public.orders;
drop policy if exists "staff update orders" on public.orders;
create policy "branch users read orders" on public.orders for select to authenticated using (customer_id = auth.uid() or public.can_access_branch(branch_id));
create policy "branch staff update orders" on public.orders for update to authenticated using (public.can_manage_branch(branch_id)) with check (public.can_manage_branch(branch_id));
drop policy if exists "products are readable by signed in users" on public.products;
create policy "products are readable by signed in users" on public.products for select to authenticated using (true);
create policy "branch admins manage branch products" on public.products for all to authenticated
using (branch_id is not null and branch_id = public.current_branch_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('branch_admin', 'staff')))
with check (branch_id is not null and branch_id = public.current_branch_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('branch_admin', 'staff')));

create policy "branch users read categories" on public.product_categories for select to authenticated using (branch_id is null or public.can_access_branch(branch_id));
create policy "admins manage categories" on public.product_categories for all to authenticated
using (public.is_admin() or (branch_id is not null and public.can_manage_branch(branch_id)))
with check (public.is_admin() or (branch_id is not null and public.can_manage_branch(branch_id)));
create policy "branch users read stock movements" on public.stock_movements for select to authenticated using (public.can_access_branch(branch_id));
create policy "branch users insert stock movements" on public.stock_movements for insert to authenticated with check (public.can_manage_branch(branch_id));
create policy "branch users read transfers" on public.inventory_transfers for select to authenticated using (public.can_access_branch(from_branch_id) or public.can_access_branch(to_branch_id));
create policy "branch users request transfers" on public.inventory_transfers for insert to authenticated with check (public.can_manage_branch(from_branch_id));
create policy "admins review transfers" on public.inventory_transfers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "branch users read transfer items" on public.inventory_transfer_items for select to authenticated
using (exists (select 1 from public.inventory_transfers t where t.id = transfer_id and (public.can_access_branch(t.from_branch_id) or public.can_access_branch(t.to_branch_id))));
create policy "branch users add transfer items" on public.inventory_transfer_items for insert to authenticated
with check (exists (select 1 from public.inventory_transfers t where t.id = transfer_id and public.can_manage_branch(t.from_branch_id)));
create policy "signed in users read loyalty settings" on public.loyalty_settings for select to authenticated using (true);
create policy "admins manage loyalty settings" on public.loyalty_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "signed in users read rewards" on public.rewards for select to authenticated using (is_active or public.is_admin());
create policy "admins manage rewards" on public.rewards for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read audit logs" on public.activity_logs for select to authenticated using (public.is_admin());
create policy "users append audit logs" on public.activity_logs for insert to authenticated with check (actor_id = auth.uid());
drop policy if exists "promotions are readable by signed in users" on public.promotions;
create policy "promotions are readable by signed in users" on public.promotions for select to authenticated using (true);
create policy "branch admins manage scoped promotions" on public.promotions for all to authenticated
using (cardinality(branch_ids) = 1 and current_branch_id() = any(branch_ids) and exists (select 1 from public.profiles where id = auth.uid() and role in ('branch_admin', 'staff')))
with check (cardinality(branch_ids) = 1 and current_branch_id() = any(branch_ids) and exists (select 1 from public.profiles where id = auth.uid() and role in ('branch_admin', 'staff')));

create or replace function public.process_pos_checkout(
  p_actor_id uuid,
  p_branch_id uuid,
  p_customer_code text,
  p_items jsonb,
  p_channel text default 'counter'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_customer_id uuid;
  v_promotion public.promotions%rowtype;
  v_product public.products%rowtype;
  v_free_product_id uuid;
  v_free_quantity integer := 0;
  v_eligible_quantity integer := 0;
  v_subtotal numeric(10, 2) := 0;
  v_discount numeric(10, 2) := 0;
  v_eligible_subtotal numeric(10, 2) := 0;
  v_points integer := 0;
  v_settings public.loyalty_settings%rowtype;
  v_item jsonb;
  v_line record;
  v_stock public.inventory%rowtype;
  v_transaction_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required.';
  end if;
  if p_channel not in ('counter', 'online') then raise exception 'Invalid order channel.'; end if;
  if not exists (select 1 from public.branches where id = p_branch_id and is_active) then
    raise exception 'Branch is not active.';
  end if;
  if p_customer_code is not null and trim(p_customer_code) <> '' then
    select id into v_customer_id from public.profiles
    where customer_code = trim(p_customer_code) and role = 'customer' and is_active;
    if v_customer_id is null then raise exception 'Customer ID is invalid or inactive.'; end if;
  end if;

  insert into public.orders (customer_id, branch_id, channel, total)
  values (v_customer_id, p_branch_id, p_channel, 0)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'quantity')::integer, 0) < 1 then raise exception 'Invalid item quantity.'; end if;
    select * into v_product from public.products
    where id = (v_item->>'productId')::uuid and is_available and (branch_id is null or branch_id = p_branch_id);
    if not found then raise exception 'Product is unavailable at this branch.'; end if;
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
    values (v_order.id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::integer);
    v_subtotal := v_subtotal + v_product.price * (v_item->>'quantity')::integer;
  end loop;

  select * into v_promotion from public.promotions p
  where p.is_active
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
    and (cardinality(p.branch_ids) = 0 or p_branch_id = any(p.branch_ids))
    and exists (
      select 1 from jsonb_array_elements(p_items) line
      where (cardinality(p.eligible_product_ids) = 0 and (p.product_id is null or (line->>'productId')::uuid = p.product_id))
         or (cardinality(p.eligible_product_ids) > 0 and (line->>'productId')::uuid = any(p.eligible_product_ids))
    )
  order by p.created_at desc limit 1;

  if found then
    select coalesce(sum((line->>'quantity')::integer), 0) into v_eligible_quantity
    from jsonb_array_elements(p_items) line
    where (cardinality(v_promotion.eligible_product_ids) = 0 and (v_promotion.product_id is null or (line->>'productId')::uuid = v_promotion.product_id))
       or (cardinality(v_promotion.eligible_product_ids) > 0 and (line->>'productId')::uuid = any(v_promotion.eligible_product_ids));
      select coalesce(sum((line->>'quantity')::integer * prod.price), 0) into v_eligible_subtotal
      from jsonb_array_elements(p_items) line
      join public.products prod on prod.id = (line->>'productId')::uuid
      where (cardinality(v_promotion.eligible_product_ids) = 0 and (v_promotion.product_id is null or prod.id = v_promotion.product_id))
         or (cardinality(v_promotion.eligible_product_ids) > 0 and prod.id = any(v_promotion.eligible_product_ids));

    if v_promotion.promo_type = 'buy_x_get_y' and v_eligible_quantity >= v_promotion.buy_quantity then
      v_free_quantity := floor(v_eligible_quantity::numeric / v_promotion.buy_quantity)::integer * v_promotion.get_quantity;
      v_free_product_id := v_promotion.free_product_id;
      if v_free_product_id is null and cardinality(v_promotion.eligible_product_ids) > 0 then v_free_product_id := v_promotion.eligible_product_ids[1]; end if;
      if v_free_product_id is null then v_free_product_id := v_promotion.product_id; end if;
      if v_free_product_id is null then v_free_product_id := (p_items->0->>'productId')::uuid; end if;
      select * into v_product from public.products where id = v_free_product_id and is_available and (branch_id is null or branch_id = p_branch_id);
      if not found then raise exception 'Promotion free product is unavailable.'; end if;
      insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, is_promo, promotion_id)
      values (v_order.id, v_product.id, v_product.name || ' (Promo)', 0, v_free_quantity, true, v_promotion.id);
    elsif v_eligible_quantity > 0 and v_promotion.promo_type = 'percentage' then
      v_discount := round(v_eligible_subtotal * least(v_promotion.discount_value, 100) / 100, 2);
    elsif v_eligible_quantity > 0 and v_promotion.promo_type in ('fixed', 'bundle') then
      v_discount := least(v_eligible_subtotal, v_promotion.discount_value);
    end if;
  end if;

  update public.orders set total = greatest(0, v_subtotal - v_discount), discount_total = v_discount,
    promotion_id = case when v_eligible_quantity > 0 then v_promotion.id else null end
  where id = v_order.id returning * into v_order;

  for v_line in select * from public.order_items where order_id = v_order.id loop
    select * into v_stock from public.inventory
    where branch_id = p_branch_id and product_id = v_line.product_id
    order by id limit 1 for update;
    if not found then raise exception 'Stock is not configured for % at this branch.', v_line.product_name; end if;
    if v_stock.quantity < v_line.quantity then raise exception 'Insufficient stock for %.', v_line.product_name; end if;
    update public.inventory set quantity = quantity - v_line.quantity, updated_at = now() where id = v_stock.id;
    insert into public.stock_movements (branch_id, inventory_id, quantity_delta, unit_cost, movement_type, reference_id, created_by)
    values (p_branch_id, v_stock.id, -v_line.quantity, v_stock.unit_cost,
      case when v_line.is_promo then 'promotion' else 'sale' end, v_order.id, p_actor_id);
  end loop;

  insert into public.receipts (order_id) values (v_order.id);
  if v_customer_id is not null and v_order.total > 0 then
    select * into v_settings from public.loyalty_settings where id = 1;
    v_points := floor(v_order.total / v_settings.amount_per_point)::integer * v_settings.points_per_amount;
    if v_points > 0 then
      insert into public.reward_transactions (user_id, order_id, points, description, transaction_type, expires_at)
      values (v_customer_id, v_order.id, v_points, 'Points earned from purchase', 'earned',
        case when v_settings.expiration_days is null then null else now() + make_interval(days => v_settings.expiration_days) end)
      on conflict (order_id) where order_id is not null and transaction_type = 'earned' do nothing
      returning id into v_transaction_id;
      if v_transaction_id is not null then
        update public.profiles set reward_points = reward_points + v_points where id = v_customer_id;
      end if;
    end if;
  end if;

  select * into v_order from public.orders where id = v_order.id;
  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', (select coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb) from public.order_items oi where oi.order_id = v_order.id),
    'promotion', case when v_eligible_quantity > 0 then jsonb_build_object('id', v_promotion.id, 'title', v_promotion.title) else null end,
    'pointsEarned', v_points
  );
end;
$$;
revoke all on function public.process_pos_checkout(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.process_pos_checkout(uuid, uuid, text, jsonb, text) to service_role;

create or replace function public.review_inventory_transfer(p_transfer_id uuid, p_reviewer_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.inventory_transfers%rowtype;
  v_item record;
  v_source public.inventory%rowtype;
  v_destination public.inventory%rowtype;
begin
  select * into v_transfer from public.inventory_transfers where id = p_transfer_id for update;
  if not found or v_transfer.status <> 'requested' then raise exception 'Transfer is not awaiting review.'; end if;
  if not p_approve then
    update public.inventory_transfers set status = 'rejected', reviewed_by = p_reviewer_id, reviewed_at = now()
    where id = p_transfer_id returning * into v_transfer;
    return to_jsonb(v_transfer);
  end if;

  for v_item in select inventory_id, quantity as transfer_quantity from public.inventory_transfer_items where transfer_id = p_transfer_id loop
    select * into v_source from public.inventory where id = v_item.inventory_id for update;
    if not found or v_source.branch_id <> v_transfer.from_branch_id or v_source.quantity < v_item.transfer_quantity then
      raise exception 'Transfer item is not available in the source branch.';
    end if;
    update public.inventory set quantity = quantity - v_item.transfer_quantity, updated_at = now() where id = v_source.id;
    insert into public.stock_movements (branch_id, inventory_id, quantity_delta, unit_cost, movement_type, reference_id, created_by)
    values (v_transfer.from_branch_id, v_source.id, -v_item.transfer_quantity, v_source.unit_cost, 'transfer_out', p_transfer_id, p_reviewer_id);

    select * into v_destination from public.inventory where branch_id = v_transfer.to_branch_id and sku = v_source.sku for update;
    if found then
      update public.inventory set quantity = quantity + v_item.transfer_quantity, updated_at = now() where id = v_destination.id returning * into v_destination;
    else
      insert into public.inventory (branch_id, product_id, name, sku, unit, quantity, low_stock_threshold, unit_cost)
      values (v_transfer.to_branch_id, v_source.product_id, v_source.name, v_source.sku, v_source.unit, v_item.transfer_quantity, v_source.low_stock_threshold, v_source.unit_cost)
      returning * into v_destination;
    end if;
    insert into public.stock_movements (branch_id, inventory_id, quantity_delta, unit_cost, movement_type, reference_id, created_by)
    values (v_transfer.to_branch_id, v_destination.id, v_item.transfer_quantity, v_source.unit_cost, 'transfer_in', p_transfer_id, p_reviewer_id);
  end loop;

  update public.inventory_transfers set status = 'completed', reviewed_by = p_reviewer_id, reviewed_at = now()
  where id = p_transfer_id returning * into v_transfer;
  return to_jsonb(v_transfer);
end;
$$;
revoke all on function public.review_inventory_transfer(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.review_inventory_transfer(uuid, uuid, boolean) to service_role;

create or replace function public.expire_customer_points(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired integer := 0;
  v_transaction record;
begin
  for v_transaction in
    select earned.id, earned.points from public.reward_transactions earned
    where earned.user_id = p_user_id and earned.transaction_type = 'earned'
      and earned.expires_at is not null and earned.expires_at <= now()
      and not exists (select 1 from public.reward_transactions expired where expired.source_transaction_id = earned.id)
    for update
  loop
    insert into public.reward_transactions (user_id, points, description, transaction_type, source_transaction_id)
    values (p_user_id, -v_transaction.points, 'Points expired', 'expired', v_transaction.id);
    v_expired := v_expired + v_transaction.points;
  end loop;
  if v_expired > 0 then
    update public.profiles set reward_points = greatest(0, reward_points - v_expired) where id = p_user_id;
  end if;
  return v_expired;
end;
$$;
revoke all on function public.expire_customer_points(uuid) from public, anon, authenticated;
grant execute on function public.expire_customer_points(uuid) to service_role;

create or replace function public.redeem_customer_reward(p_user_id uuid, p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_reward public.rewards%rowtype;
begin
  perform public.expire_customer_points(p_user_id);
  select * into v_profile from public.profiles where id = p_user_id and role = 'customer' and is_active for update;
  if not found then raise exception 'Customer account is unavailable.'; end if;
  select * into v_reward from public.rewards where id = p_reward_id and is_active for update;
  if not found then raise exception 'Reward is unavailable.'; end if;
  if v_profile.reward_points < v_reward.points_required then raise exception 'Not enough points for this reward.'; end if;
  update public.profiles set reward_points = reward_points - v_reward.points_required where id = p_user_id returning * into v_profile;
  insert into public.reward_transactions (user_id, points, description, transaction_type)
  values (p_user_id, -v_reward.points_required, 'Redeemed: ' || v_reward.name, 'redeemed');
  return jsonb_build_object('reward', to_jsonb(v_reward), 'pointsBalance', v_profile.reward_points);
end;
$$;
revoke all on function public.redeem_customer_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_customer_reward(uuid, uuid) to service_role;

create or replace function public.adjust_inventory_stock(p_inventory_id uuid, p_delta integer, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.inventory%rowtype;
begin
  if p_delta = 0 then raise exception 'Adjustment cannot be zero.'; end if;
  select * into v_stock from public.inventory where id = p_inventory_id for update;
  if not found then raise exception 'Inventory item not found.'; end if;
  if v_stock.quantity + p_delta < 0 then raise exception 'Adjustment would make stock negative.'; end if;
  update public.inventory set quantity = quantity + p_delta, updated_at = now()
  where id = p_inventory_id returning * into v_stock;
  insert into public.stock_movements (branch_id, inventory_id, quantity_delta, unit_cost, movement_type, reference_id, created_by)
  values (v_stock.branch_id, v_stock.id, p_delta, v_stock.unit_cost, case when p_delta > 0 then 'receipt' else 'adjustment' end, null, p_actor_id);
  return to_jsonb(v_stock);
end;
$$;
revoke all on function public.adjust_inventory_stock(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.adjust_inventory_stock(uuid, integer, uuid) to service_role;