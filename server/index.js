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

async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function requireUser(req, res, roles = []) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  const profile = await getProfile(user.id);
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
    const { fullName, email, password } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({ error: 'Full name, valid email, and an 8-character password are required.' });
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim(), role: 'customer' } },
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
    const profile = await getProfile(data.user.id);
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

app.get('/api/menu', async (req, res) => {
  try {
    res.json(await readTable('products'));
  } catch (err) {
    console.error("Menu lookup failure:", err.message);
    res.status(500).json({ error: "Failed to load menu items" });
  }
});

app.post('/api/admin/staff', async (req, res) => {
  try {
    const result = await requireUser(req, res, ['admin']);
    if (!result) return;
    if (!supabaseAdmin) return res.status(503).json({ error: 'Staff account creation requires a server-only service-role key.' });
    const { fullName, email, password, branchId } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({ error: 'Full name, valid email, and an 8-character password are required.' });
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() },
    });
    if (error) return res.status(400).json({ error: error.message });
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ full_name: fullName.trim(), email: email.trim().toLowerCase(), role: 'staff', branch_id: branchId || null })
      .eq('id', data.user.id)
      .select()
      .single();
    if (profileError) throw profileError;
    res.status(201).json(profile);
  } catch (error) {
    console.error('Staff account creation failure:', error.message);
    res.status(400).json({ error: 'Unable to create staff account.' });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    res.json(await readTable('inventory'));
  } catch (err) {
    console.error("Inventory lookup failure:", err.message);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const result = await requireUser(req, res);
    if (!result) return;
    const query = supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
    const { data, error } = result.profile.role === 'customer'
      ? await query.eq('customer_id', result.user.id)
      : await query;
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
    const result = await requireUser(req, res, ['staff', 'admin']);
    if (!result) return;
    const allowed = ['new', 'preparing', 'ready_for_pickup', 'completed', 'cancelled'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid order status.' });
    const { data, error } = await supabase.from('orders').update({ status: req.body.status }).eq('id', req.params.id).select().single();
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
