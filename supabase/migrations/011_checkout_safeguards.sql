-- Idempotency and order-state safeguards

create table if not exists public.checkout_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_id, idempotency_key)
);

create index if not exists checkout_requests_created_at_idx
  on public.checkout_requests(created_at);

alter table public.checkout_requests enable row level security;
revoke all on table public.checkout_requests from anon, authenticated;

create or replace function public.update_order_status_with_audit(
  p_order_id uuid,
  p_status text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_previous_status text;
  v_customer_name text;
  v_branch_name text;
  v_completed_at timestamptz;
  v_allowed boolean := false;
  v_item record;
  v_stock public.inventory%rowtype;
begin
  if p_status not in ('new', 'preparing', 'ready_for_pickup', 'completed', 'cancelled') then
    raise exception 'Invalid order status.';
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or v_actor.role not in ('staff', 'admin', 'head_admin', 'branch_admin') then
    raise exception 'You do not have permission to update orders.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if v_actor.role not in ('admin', 'head_admin')
    and v_actor.branch_id is distinct from v_order.branch_id then
    raise exception 'You can only update orders for your assigned branch.';
  end if;

  v_previous_status := v_order.status::text;
  if v_previous_status = p_status then
    return to_jsonb(v_order);
  end if;

  v_allowed :=
    (v_previous_status = 'new' and p_status in ('preparing', 'cancelled')) or
    (v_previous_status = 'preparing' and p_status in ('ready_for_pickup', 'cancelled')) or
    (v_previous_status = 'ready_for_pickup' and p_status in ('completed', 'cancelled'));

  if not v_allowed then
    raise exception 'Cannot change order status from % to %.', v_previous_status, p_status;
  end if;

  update public.orders
  set status = p_status::public.order_status,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if p_status = 'cancelled' then
    for v_item in
      select oi.product_id, oi.quantity, oi.is_promo
      from public.order_items oi
      where oi.order_id = p_order_id
    loop
      select * into v_stock
      from public.inventory
      where branch_id = v_order.branch_id and product_id = v_item.product_id
      for update;
      if found then
        update public.inventory
        set quantity = quantity + v_item.quantity, updated_at = now()
        where id = v_stock.id;
        insert into public.stock_movements
          (branch_id, inventory_id, quantity_delta, unit_cost, movement_type, reference_id, created_by)
        values
          (v_order.branch_id, v_stock.id, v_item.quantity, v_stock.unit_cost,
           'adjustment', v_order.id, p_actor_id);
      end if;
    end loop;
  end if;

  if p_status = 'completed' then
    select coalesce(profile.full_name, 'Walk-in')
    into v_customer_name
    from public.orders order_row
    left join public.profiles profile on profile.id = order_row.customer_id
    where order_row.id = p_order_id;

    select name into v_branch_name from public.branches where id = v_order.branch_id;
    v_completed_at := now();

    insert into public.activity_logs (actor_id, branch_id, action, entity_type, entity_id, details, created_at)
    values (
      p_actor_id,
      v_order.branch_id,
      'order.completed',
      'order',
      coalesce(v_order.order_number::text, v_order.id::text),
      jsonb_build_object(
        'orderId', coalesce(v_order.order_number::text, v_order.id::text),
        'customerName', coalesce(v_customer_name, 'Walk-in'),
        'branchName', coalesce(v_branch_name, 'Unknown branch'),
        'baristaName', v_actor.full_name,
        'completionTimestamp', v_completed_at,
        'statusChangedTo', 'Finished'
      ),
      v_completed_at
    );
  end if;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.update_order_status_with_audit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.update_order_status_with_audit(uuid, text, uuid) to service_role;
