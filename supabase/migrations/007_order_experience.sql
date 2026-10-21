alter table public.orders
  add column if not exists scheduled_pickup_at timestamptz,
  add column if not exists estimated_pickup_at timestamptz;

alter table public.order_items
  add column if not exists customization jsonb not null default '{}';

alter table public.reward_transactions
  add column if not exists redemption_code text,
  add column if not exists redeemed_at timestamptz;

create unique index if not exists reward_transactions_redemption_code_idx
  on public.reward_transactions(redemption_code)
  where redemption_code is not null;

create or replace function public.notify_order_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_name text;
begin
  if new.status = 'ready_for_pickup' and old.status is distinct from new.status and new.customer_id is not null then
    select name into v_branch_name from public.branches where id = new.branch_id;
    insert into public.notifications (user_id, order_id, title, message)
    values (
      new.customer_id,
      new.id,
      'Your order is ready for pickup',
      'Order #' || new.order_number || ' is ready at ' || coalesce(v_branch_name, 'your pickup branch') || '.'
    );
  end if;
  return new;
end;
$$;

create or replace function public.process_customized_pos_checkout(
  p_actor_id uuid,
  p_branch_id uuid,
  p_customer_code text,
  p_items jsonb,
  p_channel text default 'counter',
  p_pickup_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_items jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_customization jsonb;
  v_product public.products%rowtype;
  v_size text;
  v_milk text;
  v_sweetness integer;
  v_extra_espresso boolean;
  v_adjustment numeric(10, 2);
  v_total_adjustment numeric(10, 2) := 0;
  v_points integer := 0;
  v_old_points integer := 0;
  v_settings public.loyalty_settings%rowtype;
  v_reward public.reward_transactions%rowtype;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required.';
  end if;
  if p_pickup_at is not null and (
    p_pickup_at <= now()
    or p_pickup_at > now() + interval '2 hours'
    or extract(minute from p_pickup_at)::integer % 15 <> 0
    or extract(second from p_pickup_at) <> 0
  ) then
    raise exception 'Choose a pickup slot within the next two hours.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('productId', grouped.product_id, 'quantity', grouped.quantity)), '[]'::jsonb)
    into v_base_items
  from (
    select (line->>'productId')::uuid as product_id, sum((line->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) line
    group by (line->>'productId')::uuid
  ) grouped;

  v_result := public.process_pos_checkout(p_actor_id, p_branch_id, p_customer_code, v_base_items, p_channel);
  select * into v_order from public.orders where id = (v_result->'order'->>'id')::uuid for update;

  delete from public.order_items where order_id = v_order.id and not is_promo;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'quantity')::integer, 0) < 1 then
      raise exception 'Invalid item quantity.';
    end if;
    select * into v_product from public.products
    where id = (v_item->>'productId')::uuid and is_available and (branch_id is null or branch_id = p_branch_id);
    if not found then raise exception 'Product is unavailable at this branch.'; end if;

    v_customization := coalesce(v_item->'customization', '{}'::jsonb);
    if jsonb_typeof(v_customization) <> 'object' then raise exception 'Invalid drink customization.'; end if;
    v_size := coalesce(v_customization->>'size', 'regular');
    v_milk := coalesce(v_customization->>'milk', 'dairy');
    v_sweetness := coalesce((v_customization->>'sweetness')::integer, 100);
    v_extra_espresso := coalesce((v_customization->>'extraEspresso')::boolean, false);
    if v_size not in ('regular', 'large') or v_milk not in ('dairy', 'oat')
      or v_sweetness not in (0, 25, 50, 75, 100) then
      raise exception 'Invalid drink customization.';
    end if;
    if lower(v_product.category) not in ('coffee', 'cold', 'matcha')
      and (v_size <> 'regular' or v_milk <> 'dairy' or v_sweetness <> 100 or v_extra_espresso) then
      raise exception 'Only drinks can be customized.';
    end if;

    v_adjustment := case when v_size = 'large' then 50 else 0 end
      + case when v_milk = 'oat' then 35 else 0 end
      + case when v_extra_espresso then 50 else 0 end;
    v_total_adjustment := v_total_adjustment + v_adjustment * (v_item->>'quantity')::integer;

    insert into public.order_items (
      order_id, product_id, product_name, unit_price, quantity, customization
    ) values (
      v_order.id,
      v_product.id,
      v_product.name,
      v_product.price + v_adjustment,
      (v_item->>'quantity')::integer,
      jsonb_build_object(
        'size', v_size,
        'milk', v_milk,
        'sweetness', v_sweetness,
        'extraEspresso', v_extra_espresso,
        'priceAdjustment', v_adjustment
      )
    );
  end loop;

  update public.orders
  set total = total + v_total_adjustment,
      scheduled_pickup_at = p_pickup_at,
      estimated_pickup_at = coalesce(p_pickup_at, now() + interval '20 minutes'),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  if v_order.customer_id is not null and v_order.total > 0 then
    select * into v_settings from public.loyalty_settings where id = 1;
    if found and v_settings.amount_per_point > 0 then
      v_points := floor(v_order.total / v_settings.amount_per_point)::integer * v_settings.points_per_amount;
      select * into v_reward from public.reward_transactions
      where order_id = v_order.id and transaction_type = 'earned' for update;
      if found then
        v_old_points := v_reward.points;
        update public.reward_transactions set points = v_points where id = v_reward.id;
        update public.profiles set reward_points = greatest(0, reward_points + v_points - v_old_points)
        where id = v_order.customer_id;
      elsif v_points > 0 then
        insert into public.reward_transactions (user_id, order_id, points, description, transaction_type, expires_at)
        values (
          v_order.customer_id,
          v_order.id,
          v_points,
          'Points earned from purchase',
          'earned',
          case when v_settings.expiration_days is null then null else now() + make_interval(days => v_settings.expiration_days) end
        );
        update public.profiles set reward_points = reward_points + v_points where id = v_order.customer_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', (select coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb) from public.order_items oi where oi.order_id = v_order.id),
    'promotion', v_result->'promotion',
    'pointsEarned', v_points
  );
end;
$$;

revoke all on function public.process_customized_pos_checkout(uuid, uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.process_customized_pos_checkout(uuid, uuid, text, jsonb, text, timestamptz) to service_role;

create or replace function public.redeem_customer_reward(p_user_id uuid, p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_reward public.rewards%rowtype;
  v_redemption_code text;
begin
  perform public.expire_customer_points(p_user_id);
  select * into v_profile from public.profiles where id = p_user_id and role = 'customer' and is_active for update;
  if not found then raise exception 'Customer account is unavailable.'; end if;
  select * into v_reward from public.rewards where id = p_reward_id and is_active for update;
  if not found then raise exception 'Reward is unavailable.'; end if;
  if v_profile.reward_points < v_reward.points_required then raise exception 'Not enough points for this reward.'; end if;
  update public.profiles set reward_points = reward_points - v_reward.points_required where id = p_user_id returning * into v_profile;
  v_redemption_code := upper(replace(gen_random_uuid()::text, '-', ''));
  insert into public.reward_transactions (user_id, points, description, transaction_type, redemption_code)
  values (p_user_id, -v_reward.points_required, 'Redeemed: ' || v_reward.name, 'redeemed', v_redemption_code);
  return jsonb_build_object(
    'reward', to_jsonb(v_reward),
    'pointsBalance', v_profile.reward_points,
    'redemptionCode', v_redemption_code
  );
end;
$$;
revoke all on function public.redeem_customer_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_customer_reward(uuid, uuid) to service_role;
