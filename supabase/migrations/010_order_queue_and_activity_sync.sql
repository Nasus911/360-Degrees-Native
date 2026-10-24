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
  v_previous_status public.order_status;
  v_customer_name text;
  v_branch_name text;
  v_completed_at timestamptz;
begin
  if p_status not in ('new', 'preparing', 'ready_for_pickup', 'completed', 'cancelled') then
    raise exception 'Invalid order status.';
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or v_actor.role not in ('staff', 'admin', 'head_admin', 'branch_admin') then
    raise exception 'You do not have permission to update orders.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_actor.role not in ('admin', 'head_admin')
    and v_actor.branch_id is distinct from v_order.branch_id then
    raise exception 'You can only update orders for your assigned branch.';
  end if;

  v_previous_status := v_order.status;
  if v_previous_status::text = p_status then
    return to_jsonb(v_order);
  end if;

  update public.orders
  set status = p_status::public.order_status,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

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

drop policy if exists "admins read audit logs" on public.activity_logs;
create policy "admins and branch admins read scoped audit logs" on public.activity_logs
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'branch_admin'
      and branch_id = activity_logs.branch_id
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'branches'
    ) then
      alter publication supabase_realtime add table public.branches;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_logs'
    ) then
      alter publication supabase_realtime add table public.activity_logs;
    end if;
  end if;
end;
$$;
