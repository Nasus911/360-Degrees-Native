require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

function requireConfiguration() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || process.env.SUPABASE_URL === 'https://supabase.co' || process.env.SUPABASE_KEY === 'your-anon-public-api-key-here') {
    throw new Error('Configure SUPABASE_URL and SUPABASE_KEY in server/.env before starting the API.');
  }
}

async function getUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user;
}

async function getProfile(userId, accessToken) {
  const profileClient = accessToken
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    : supabaseAdmin || supabase;
  const { data, error } = await profileClient.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function requireUser(req, res, roles = []) {
  const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  const profile = await getProfile(user.id, accessToken);
  if (profile.is_active === false) {
    res.status(403).json({ error: 'This account is inactive. Contact a head administrator.' });
    return null;
  }
  if (profile.branch_id && profile.role !== 'customer') {
    const { data: branch, error: branchError } = await (supabaseAdmin || supabase).from('branches').select('is_active').eq('id', profile.branch_id).single();
    if (branchError || !branch?.is_active) {
      res.status(403).json({ error: 'This account’s branch is inactive.' });
      return null;
    }
  }
  if (roles.length && !roles.includes(profile.role)) {
    res.status(403).json({ error: 'You do not have permission for this action.' });
    return null;
  }
  return { user, profile };
}

async function readTable(tableName) {
  const { data, error } = await supabase.from(tableName).select('*');

  if (error) {
    console.error(`Error reading table ${tableName}:`, error);
    throw error;
  }

  return data;
}

async function logActivity(actorId, branchId, action, entityType, entityId, details = {}) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    actor_id: actorId,
    branch_id: branchId || null,
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    details,
  });
  if (error) console.error('Audit log failure:', error.message);
}


app.get('/api/message', async (req, res) => {
  try {
    const data = await readTable('todos');

    res.json({ message: `Database Connected! Found ${data.length} items.` });
  } catch (err) {
    console.error("Database connection failure:", err.message);
    res.status(500).json({ error: "Failed to connect to Supabase" });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, contactNumber } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password || password.length < 8 || !contactNumber?.trim()) {
      return res.status(400).json({ error: 'Full name, valid email, an 8-character password, and contact number are required.' });
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim(), role: 'customer', contact_number: contactNumber.trim() } },
    });
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ session: data.session, user: data.user });
  } catch (error) {
    console.error('Registration failure:', error.message);
    res.status(500).json({ error: 'Unable to register account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email: email?.trim().toLowerCase(), password });
    if (error) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const profile = await getProfile(data.user.id, data.session?.access_token);
    res.json({ session: data.session, user: data.user, profile });
  } catch (error) {
    console.error('Login failure:', error.message);
    res.status(500).json({ error: 'Unable to sign in.' });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const result = await requireUser(req, res);
    if (result) res.json(result.profile);
  } catch (error) {
    console.error('Profile lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load profile.' });
  }
});

app.patch('/api/me', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['customer']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Profile updates require a server-only service-role key.' });
    const { fullName, contactNumber, address } = req.body;
    if (typeof fullName !== 'string' || fullName.trim().length < 2
      || typeof contactNumber !== 'string' || !contactNumber.trim()
      || typeof address !== 'string') {
      return res.status(400).json({ error: 'Full name and contact number are required.' });
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        contact_number: contactNumber.trim(),
        address: address.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', result.user.id)
      .select('id,full_name,email,role,contact_number,address')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Profile update failure:', error.message);
    res.status(500).json({ error: 'Unable to update account details.' });
  }
});

app.get('/api/menu', async (req, res) => {
  try {
    res.json(await readTable('products'));
  } catch (err) {
    console.error("Menu lookup failure:", err.message);
    res.status(500).json({ error: "Failed to load menu items" });
  }
});

app.get('/api/admin/branches', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin']);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('branches').select('*').order('name');
    if (!['admin', 'head_admin'].includes(result.profile.role)) query = query.eq('id', result.profile.branch_id);
    else if (req.query.branchId) query = query.eq('id', req.query.branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Branch lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load branches.' });
  }
});

app.post('/api/admin/branches', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Branch management requires a server-only service-role key.' });
    const { name, city, address } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof city !== 'string' || !city.trim()) {
      return res.status(400).json({ error: 'Branch name and city are required.' });
    }
    const { data, error } = await supabaseAdmin.from('branches').insert({ name: name.trim(), city: city.trim(), address: address?.trim() || null }).select().single();
    if (error) throw error;
    await logActivity(result.user.id, data.id, 'branch.created', 'branch', data.id, { name: data.name });
    res.status(201).json(data);
  } catch (error) {
    console.error('Branch creation failure:', error.message);
    res.status(400).json({ error: 'Unable to create branch.' });
  }
});

app.patch('/api/admin/branches/:id', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Branch management requires a server-only service-role key.' });
    const allowed = {};
    for (const field of ['name', 'city', 'address', 'is_active']) {
      if (Object.hasOwn(req.body, field)) allowed[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
    if (!Object.keys(allowed).length) return res.status(400).json({ error: 'Provide branch fields to update.' });
    const { data, error } = await supabaseAdmin.from('branches').update(allowed).eq('id', req.params.id).select().single();
    if (error) throw error;
    await logActivity(result.user.id, data.id, 'branch.updated', 'branch', data.id, allowed);
    res.json(data);
  } catch (error) {
    console.error('Branch update failure:', error.message);
    res.status(400).json({ error: 'Unable to update branch.' });
  }
});

app.get('/api/admin/reports/summary', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin']);
    if (!result) return;
    const branchId = ['admin', 'head_admin'].includes(result.profile.role) ? req.query.branchId || null : result.profile.branch_id;
    let orderQuery = (supabaseAdmin || supabase).from('orders').select('id,total,customer_id,order_items(quantity,unit_price,products(unit_cost))');
    let stockQuery = (supabaseAdmin || supabase).from('inventory').select('quantity,low_stock_threshold,unit_cost');
    if (branchId) {
      orderQuery = orderQuery.eq('branch_id', branchId);
      stockQuery = stockQuery.eq('branch_id', branchId);
    }
    const [{ data: orders, error: orderError }, { data: stock, error: stockError }] = await Promise.all([orderQuery, stockQuery]);
    if (orderError) throw orderError;
    if (stockError) throw stockError;
    const sales = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const costs = orders.reduce((sum, order) => sum + order.order_items.reduce((itemSum, item) => itemSum + Number(item.products?.unit_cost || 0) * item.quantity, 0), 0);
    res.json({
      branchId,
      sales,
      orders: orders.length,
      averageOrder: orders.length ? sales / orders.length : 0,
      customers: new Set(orders.map((order) => order.customer_id).filter(Boolean)).size,
      lowStock: stock.filter((item) => item.quantity <= item.low_stock_threshold).length,
      inventoryValue: stock.reduce((sum, item) => sum + Number(item.unit_cost) * item.quantity, 0),
      costOfGoods: costs,
      grossProfit: sales - costs,
    });
  } catch (error) {
    console.error('Branch report failure:', error.message);
    res.status(500).json({ error: 'Unable to load branch report.' });
  }
});

app.get('/api/admin/audit', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin']);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('activity_logs')
      .select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(200);
    if (req.query.branchId) query = query.eq('branch_id', req.query.branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Audit log lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load audit logs.' });
  }
});

app.post('/api/admin/accounts', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Account creation requires a server-only service-role key.' });
    const { fullName, email, password, role, contactNumber, address } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const headAdmin = ['admin', 'head_admin'].includes(result.profile.role);
    const allowedRoles = headAdmin
      ? ['branch_admin', 'cashier', 'barista', 'staff', 'customer']
      : ['cashier', 'barista', 'staff'];
    const branchId = headAdmin ? req.body.branchId || null : result.profile.branch_id;
    if (typeof fullName !== 'string' || !fullName.trim()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      || typeof password !== 'string' || password.length < 8
      || !allowedRoles.includes(role)
      || typeof contactNumber !== 'string' || !contactNumber.trim()
      || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ error: 'Name, valid email, password, account type, contact number, and address are required.' });
    }
    if (role !== 'customer' && !branchId) return res.status(400).json({ error: 'An employee account must be assigned to a branch.' });
    if (branchId) {
      const { data: branch, error: branchError } = await supabaseAdmin.from('branches').select('id,is_active').eq('id', branchId).single();
      if (branchError || !branch?.is_active) return res.status(400).json({ error: 'Select an active branch.' });
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim(), contact_number: contactNumber.trim() },
    });
    if (error) return res.status(400).json({ error: error.message });
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        email: normalizedEmail,
        role,
        branch_id: role === 'customer' ? null : branchId,
        contact_number: contactNumber.trim(),
        address: address.trim(),
      })
      .eq('id', data.user.id)
      .select()
      .single();
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw profileError;
    }
    await logActivity(result.user.id, branchId, 'account.created', 'profile', profile.id, { role, email: normalizedEmail });
    res.status(201).json(profile);
  } catch (error) {
    console.error('Admin account creation failure:', error.message);
    res.status(400).json({ error: 'Unable to create account.' });
  }
});

app.get('/api/admin/accounts', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin']);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('profiles').select('id,full_name,email,role,branch_id,is_active,contact_number,address').order('full_name');
    if (!['admin', 'head_admin'].includes(result.profile.role)) query = query.eq('branch_id', result.profile.branch_id);
    else if (req.query.branchId) query = query.eq('branch_id', req.query.branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Employee lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load employee accounts.' });
  }
});

app.patch('/api/admin/accounts/:id', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Account management requires a server-only service-role key.' });
    const { data: target, error: targetError } = await supabaseAdmin.from('profiles').select('id,role,branch_id').eq('id', req.params.id).single();
    if (targetError) throw targetError;
    const headAdmin = ['admin', 'head_admin'].includes(result.profile.role);
    if (['admin', 'head_admin'].includes(target.role)) return res.status(403).json({ error: 'Head administrator accounts cannot be deactivated or reassigned here.' });
    if (!headAdmin && (target.branch_id !== result.profile.branch_id || !['cashier', 'barista', 'staff'].includes(target.role))) {
      return res.status(403).json({ error: 'You can only manage employees assigned to your branch.' });
    }
    const updates = {};
    if (typeof req.body.isActive === 'boolean') updates.is_active = req.body.isActive;
    if (headAdmin && typeof req.body.role === 'string') updates.role = req.body.role;
    if (headAdmin && Object.hasOwn(req.body, 'branchId')) updates.branch_id = req.body.branchId || null;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Provide a role, branch, or activation change.' });
    if (updates.role && !['branch_admin', 'cashier', 'barista', 'staff', 'customer'].includes(updates.role)) {
      return res.status(400).json({ error: 'Invalid employee role.' });
    }
    const { data, error } = await supabaseAdmin.from('profiles').update(updates).eq('id', req.params.id)
      .select('id,full_name,email,role,branch_id,is_active').single();
    if (error) throw error;
    if (typeof updates.is_active === 'boolean') {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
        ban_duration: updates.is_active ? 'none' : '876000h',
      });
      if (authUpdateError) throw authUpdateError;
    }
    await logActivity(result.user.id, data.branch_id, data.is_active ? 'account.updated' : 'account.deactivated', 'profile', data.id, updates);
    res.json(data);
  } catch (error) {
    console.error('Employee update failure:', error.message);
    res.status(400).json({ error: 'Unable to update employee account.' });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'staff']);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('inventory').select('*, branches(name)').order('name');
    if (!['admin', 'head_admin'].includes(result.profile.role)) query = query.eq('branch_id', result.profile.branch_id);
    else if (req.query.branchId) query = query.eq('branch_id', req.query.branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Inventory lookup failure:', error.message);
    res.status(500).json({ error: 'Failed to load inventory' });
  }
});

app.get('/api/inventory/movements', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'staff']);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('stock_movements')
      .select('*, inventory(name,sku), branches(name)')
      .order('created_at', { ascending: false }).limit(100);
    if (!['admin', 'head_admin'].includes(result.profile.role)) query = query.eq('branch_id', result.profile.branch_id);
    else if (req.query.branchId) query = query.eq('branch_id', req.query.branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Stock movement lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load stock movements.' });
  }
});

app.post('/api/inventory/:id/adjust', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'staff']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Inventory adjustment requires a service-role key.' });
    const delta = Number(req.body.delta);
    if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'Enter a non-zero whole-number adjustment.' });
    const { data: item, error: itemError } = await supabaseAdmin.from('inventory').select('branch_id').eq('id', req.params.id).single();
    if (itemError) throw itemError;
    if (!['admin', 'head_admin'].includes(result.profile.role) && item.branch_id !== result.profile.branch_id) {
      return res.status(403).json({ error: 'You can only adjust inventory at your assigned branch.' });
    }
    const { data, error } = await supabaseAdmin.rpc('adjust_inventory_stock', { p_inventory_id: req.params.id, p_delta: delta, p_actor_id: result.user.id });
    if (error) throw error;
    await logActivity(result.user.id, data.branch_id, 'inventory.adjusted', 'inventory', data.id, { delta });
    res.json(data);
  } catch (error) {
    console.error('Inventory adjustment failure:', error.message);
    res.status(400).json({ error: error.message || 'Unable to adjust inventory.' });
  }
});

app.post('/api/inventory/transfers', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'staff']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Inventory transfers require a service-role key.' });
    const fromBranchId = ['admin', 'head_admin'].includes(result.profile.role) ? req.body.fromBranchId : result.profile.branch_id;
    const { toBranchId, items } = req.body;
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Choose two different branches and at least one stock item.' });
    }
    const { data: branchRows, error: branchError } = await supabaseAdmin.from('branches').select('id,is_active').in('id', [fromBranchId, toBranchId]);
    if (branchError || branchRows.length !== 2 || branchRows.some((branch) => !branch.is_active)) {
      return res.status(400).json({ error: 'Transfers require two active branches.' });
    }
    const { data: transfer, error } = await supabaseAdmin.from('inventory_transfers')
      .insert({ from_branch_id: fromBranchId, to_branch_id: toBranchId, requested_by: result.user.id })
      .select().single();
    if (error) throw error;
    const { error: itemsError } = await supabaseAdmin.from('inventory_transfer_items').insert(items.map((item) => ({
      transfer_id: transfer.id,
      inventory_id: item.inventoryId,
      quantity: item.quantity,
    })));
    if (itemsError) {
      await supabaseAdmin.from('inventory_transfers').delete().eq('id', transfer.id);
      throw itemsError;
    }
    await logActivity(result.user.id, fromBranchId, 'inventory.transfer_requested', 'inventory_transfer', transfer.id, { toBranchId, items });
    res.status(201).json(transfer);
  } catch (error) {
    console.error('Inventory transfer request failure:', error.message);
    res.status(400).json({ error: 'Unable to request inventory transfer.' });
  }
});

app.get('/api/inventory/transfers', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'staff']);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('inventory_transfers').select('*, inventory_transfer_items(*)').order('created_at', { ascending: false });
    if (!['admin', 'head_admin'].includes(result.profile.role)) {
      query = query.or(`from_branch_id.eq.${result.profile.branch_id},to_branch_id.eq.${result.profile.branch_id}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Inventory transfer lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load transfer requests.' });
  }
});

app.patch('/api/inventory/transfers/:id/review', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Transfer approval requires a service-role key.' });
    if (!['approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Choose approved or rejected.' });
    const { data, error } = await supabaseAdmin.rpc('review_inventory_transfer', {
      p_transfer_id: req.params.id,
      p_reviewer_id: result.user.id,
      p_approve: req.body.status === 'approved',
    });
    if (error) throw error;
    await logActivity(result.user.id, data.from_branch_id, `inventory.transfer_${req.body.status}`, 'inventory_transfer', req.params.id);
    res.json(data);
  } catch (error) {
    console.error('Inventory transfer review failure:', error.message);
    res.status(400).json({ error: 'Unable to review inventory transfer.' });
  }
});

app.post('/api/pos/checkout', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'cashier', 'barista', 'staff', 'customer']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'POS checkout requires a server-only service-role key.' });
    const isHeadAdmin = ['admin', 'head_admin'].includes(result.profile.role);
    const branchId = isHeadAdmin || result.profile.role === 'customer' ? req.body.branchId || result.profile.branch_id : result.profile.branch_id;
    if (!branchId || !Array.isArray(req.body.items) || !req.body.items.length) {
      return res.status(400).json({ error: 'Select a branch and add products before charging.' });
    }
    const { data, error } = await supabaseAdmin.rpc('process_pos_checkout', {
      p_actor_id: result.user.id,
      p_branch_id: branchId,
      p_customer_code: result.profile.role === 'customer' ? result.profile.customer_code : req.body.customerCode || null,
      p_items: req.body.items,
      p_channel: result.profile.role === 'customer' ? 'online' : 'counter',
    });
    if (error) throw error;
    await logActivity(result.user.id, branchId, 'pos.checkout', 'order', data.order.id, { total: data.order.total, promotion: data.promotion?.id, customerId: data.order.customer_id });
    res.status(201).json(data);
  } catch (error) {
    console.error('POS checkout failure:', error.message);
    res.status(400).json({ error: error.message || 'Unable to complete checkout.' });
  }
});

app.get('/api/pos/customers/:code', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin', 'head_admin', 'branch_admin', 'cashier', 'barista', 'staff']);
    if (!result) return;
    const { data, error } = await (supabaseAdmin || supabase).from('profiles')
      .select('id,full_name,customer_code,reward_points,is_active')
      .eq('customer_code', req.params.code.trim()).eq('role', 'customer').single();
    if (error || !data?.is_active) return res.status(404).json({ error: 'Customer ID not found.' });
    res.json(data);
  } catch (error) {
    console.error('Customer lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to look up customer.' });
  }
});

app.post('/api/loyalty/redeem', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['customer']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Reward redemption requires a service-role key.' });
    if (typeof req.body.rewardId !== 'string') return res.status(400).json({ error: 'Select a reward.' });
    const { data, error } = await supabaseAdmin.rpc('redeem_customer_reward', { p_user_id: result.user.id, p_reward_id: req.body.rewardId });
    if (error) throw error;
    await logActivity(result.user.id, result.profile.branch_id, 'loyalty.reward_redeemed', 'reward', req.body.rewardId);
    res.json(data);
  } catch (error) {
    console.error('Reward redemption failure:', error.message);
    res.status(400).json({ error: error.message || 'Unable to redeem reward.' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const result = await requireUser(req, res);
    if (!result) return;
    let query = (supabaseAdmin || supabase).from('orders').select('*, order_items(*), promotions(title)').order('created_at', { ascending: false });
    if (result.profile.role === 'customer') query = query.eq('customer_id', result.user.id);
    else if (!['admin', 'head_admin'].includes(result.profile.role)) query = query.eq('branch_id', result.profile.branch_id);
    else if (req.query.branchId) query = query.eq('branch_id', req.query.branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Order lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load orders.' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['customer', 'staff', 'admin']);
    if (!result) return;
    const { branchId, items } = req.body;
    if (!branchId || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'A branch and at least one item are required.' });
    const productIds = items.map((item) => item.productId);
    const { data: products, error: productError } = await supabase.from('products').select('id,name,price').in('id', productIds);
    if (productError) throw productError;
    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('Invalid order item.');
      return { productId: product.id, productName: product.name, unitPrice: product.price, quantity: item.quantity };
    });
    const total = normalizedItems.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
    const { data: order, error } = await supabase.from('orders').insert({ customer_id: result.user.id, branch_id: branchId, total, channel: 'online' }).select().single();
    if (error) throw error;
    const { error: itemsError } = await supabase.from('order_items').insert(normalizedItems.map((item) => ({ order_id: order.id, ...item })));
    if (itemsError) throw itemsError;
    res.status(201).json({ ...order, items: normalizedItems });
  } catch (error) {
    console.error('Order creation failure:', error.message);
    res.status(400).json({ error: 'Unable to create order.' });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['staff', 'admin', 'head_admin', 'branch_admin', 'cashier', 'barista']);
    if (!result) return;
    const allowed = ['new', 'preparing', 'ready_for_pickup', 'completed', 'cancelled'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid order status.' });
    let query = (supabaseAdmin || supabase).from('orders').update({ status: req.body.status }).eq('id', req.params.id);
    if (!['admin', 'head_admin'].includes(result.profile.role)) query = query.eq('branch_id', result.profile.branch_id);
    const { data, error } = await query.select().single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Order status failure:', error.message);
    res.status(400).json({ error: 'Unable to update order status.' });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const result = await requireUser(req, res);
    if (!result) return;
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Notification lookup failure:', error.message);
    res.status(500).json({ error: 'Unable to load notifications.' });
  }
});

try {
  requireConfiguration();
  app.listen(PORT, () => console.log(`Server running smoothly on http://localhost:${PORT}`));
} catch (error) {
  console.error(`Server configuration error: ${error.message}`);
  process.exitCode = 1;
}
