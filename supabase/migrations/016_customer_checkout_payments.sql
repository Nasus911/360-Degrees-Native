alter table public.orders
  add column if not exists payment_method text not null default 'fake_money'
    check (payment_method in ('fake_money', 'points')),
  add column if not exists points_redeemed integer not null default 0
    check (points_redeemed >= 0);

drop function if exists public.process_customer_checkout(uuid, uuid, jsonb, timestamptz);

create or replace function public.process_customer_checkout(
  p_customer_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_pickup_at timestamptz default null,
  p_payment_method text default 'fake_money'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.profiles%rowtype;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_points_earned integer := 0;
  v_points_redeemed integer := 0;
begin
  if coalesce(p_payment_method, '') not in ('fake_money', 'points') then
    raise exception 'Choose a valid payment method.';
  end if;

  perform public.expire_customer_points(p_customer_id);
  select * into v_customer
  from public.profiles
  where id = p_customer_id
    and role = 'customer'
    and is_active
  for update;
  if not found then
    raise exception 'Customer account is unavailable.';
  end if;

  v_result := public.process_customized_pos_checkout(
    p_customer_id,
    p_branch_id,
    v_customer.customer_code,
    p_items,
    'online',
    p_pickup_at
  );
  select * into v_order
  from public.orders
  where id = (v_result->'order'->>'id')::uuid
  for update;
  if not found then
    raise exception 'Customer checkout did not return an order.';
  end if;

  if p_payment_method = 'points' then
    v_points_redeemed := ceil(v_order.total)::integer;
    if v_customer.reward_points < v_points_redeemed then
      raise exception 'Not enough points to pay for this order. You need % points.', v_points_redeemed;
    end if;

    v_points_earned := coalesce((v_result->>'pointsEarned')::integer, 0);
    if v_points_earned > 0 then
      delete from public.reward_transactions
      where order_id = v_order.id
        and transaction_type = 'earned';
    end if;

    update public.profiles
    set reward_points = reward_points - v_points_earned - v_points_redeemed
    where id = p_customer_id
    returning * into v_customer;

    if v_points_redeemed > 0 then
      insert into public.reward_transactions (
        user_id, order_id, points, description, transaction_type
      ) values (
        p_customer_id,
        v_order.id,
        -v_points_redeemed,
        'Points used for order #' || v_order.order_number,
        'redeemed'
      );
    end if;
  end if;

  update public.orders
  set customer_id = p_customer_id,
      payment_method = p_payment_method,
      points_redeemed = v_points_redeemed
  where id = v_order.id
  returning * into v_order;

  select * into v_customer
  from public.profiles
  where id = p_customer_id;

  return jsonb_set(v_result, '{order}', to_jsonb(v_order), true)
    || jsonb_build_object(
      'pointsBalance', v_customer.reward_points,
      'pointsRedeemed', v_points_redeemed
    );
end;
$$;

revoke all on function public.process_customer_checkout(uuid, uuid, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.process_customer_checkout(uuid, uuid, jsonb, timestamptz, text) to service_role;
