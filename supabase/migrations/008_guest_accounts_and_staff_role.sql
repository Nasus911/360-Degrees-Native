alter table public.profiles
  add column if not exists guest_expires_at timestamptz;

update public.profiles
set role = 'staff'
where role in ('cashier', 'barista');

create or replace function public.process_guest_checkout(
  p_actor_id uuid,
  p_guest_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_pickup_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_order_id uuid;
begin
  if p_actor_id is distinct from p_guest_id
    or not exists (
      select 1 from public.profiles
      where id = p_guest_id
        and role = 'guest'
        and is_active
        and guest_expires_at > now()
    ) then
    raise exception 'Guest account is unavailable or expired.';
  end if;

  v_result := public.process_customized_pos_checkout(
    p_actor_id,
    p_branch_id,
    null,
    p_items,
    'online',
    p_pickup_at
  );
  v_order_id := (v_result->'order'->>'id')::uuid;
  update public.orders set customer_id = p_guest_id where id = v_order_id;
  v_result := jsonb_set(v_result, '{order,customer_id}', to_jsonb(p_guest_id), true);
  return v_result;
end;
$$;

revoke all on function public.process_guest_checkout(uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.process_guest_checkout(uuid, uuid, uuid, jsonb, timestamptz) to service_role;
