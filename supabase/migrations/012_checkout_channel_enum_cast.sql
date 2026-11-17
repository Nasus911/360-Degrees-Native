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
  values (v_customer_id, p_branch_id, p_channel::public.order_channel, 0)
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
