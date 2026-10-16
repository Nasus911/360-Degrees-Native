import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from './lib/supabase';
import QRCode from 'react-native-qrcode-svg';

const products = [
  { id: 1, name: 'Iced Spanish Latte', category: 'Coffee', price: 185, stock: 38, emoji: '🥤', description: 'Local espresso, condensed milk, silky and balanced.' },
  { id: 2, name: 'Ube Cloud Latte', category: 'Coffee', price: 215, stock: 8, emoji: '🧋', description: 'Earthy ube and sea-salt cream.' },
  { id: 3, name: 'Sea Salt Cold Brew', category: 'Cold', price: 215, stock: 24, emoji: '🧋', description: '18-hour brew with soft savory foam.' },
  { id: 4, name: 'Flat White', category: 'Coffee', price: 190, stock: 31, emoji: '☕', description: 'Double espresso with velvety steamed milk.' },
  { id: 5, name: 'Calamansi Espresso', category: 'Cold', price: 175, stock: 19, emoji: '🍋', description: 'Bright citrus sparkle and double espresso.' },
  { id: 6, name: 'Matcha Strawberry', category: 'Matcha', price: 225, stock: 14, emoji: '🍵', description: 'Ceremonial matcha layered with strawberry.' },
  { id: 7, name: 'Butter Croissant', category: 'Food', price: 125, stock: 17, emoji: '🥐', description: 'Flaky, baked fresh every morning.' },
  { id: 8, name: 'Banana Bread', category: 'Food', price: 110, stock: 12, emoji: '🍰', description: 'A soft slice with toasted walnuts.' },
  { id: 9, name: 'Oat Milk', category: 'Inventory', price: 0, stock: 6, emoji: '🥛', description: 'Barista oat milk cartons.' },
  { id: 10, name: 'Ube Syrup', category: 'Inventory', price: 0, stock: 8, emoji: '🫙', description: 'House ube syrup bottles.' },
];

const roleConfig = {
  admin: { label: 'Head Admin', person: 'Richard Dean Briones', subtitle: 'Head administrator', initialPage: 'overview', pages: [['overview', 'Overview', '⌂'], ['branches', 'Branches', '⌖'], ['inventory', 'Inventory', '▪'], ['products', 'Products', '☕'], ['promotions', 'Promotions', '%'], ['reports', 'Reports', '▤'], ['loyalty', 'Loyalty rules', '◎'], ['team', 'Employees', '♙'], ['audit', 'Activity log', '◷']] },
  head_admin: { label: 'Head Admin', person: '', subtitle: 'Head administrator', initialPage: 'overview', pages: [['overview', 'Overview', '⌂'], ['branches', 'Branches', '⌖'], ['inventory', 'Inventory', '▪'], ['products', 'Products', '☕'], ['promotions', 'Promotions', '%'], ['reports', 'Reports', '▤'], ['loyalty', 'Loyalty rules', '◎'], ['team', 'Employees', '♙'], ['audit', 'Activity log', '◷']] },
  branch_admin: { label: 'Branch Admin', person: '', subtitle: 'Branch administrator', initialPage: 'overview', pages: [['overview', 'Overview', '⌂'], ['inventory', 'Inventory', '▪'], ['reports', 'Reports', '▤'], ['team', 'Employees', '♙'], ['receipts', 'Today orders', '◷'], ['audit', 'Activity log', '▣']] },
  cashier: { label: 'Cashier', person: '', subtitle: 'Cashier', initialPage: 'pos', pages: [['pos', 'Point of sale', '▣'], ['queue', 'Order queue', '◷'], ['receipts', 'Receipts', '▤']] },
  barista: { label: 'Barista', person: '', subtitle: 'Barista', initialPage: 'pos', pages: [['pos', 'Point of sale', '▣'], ['queue', 'Order queue', '◷']] },
  staff: { label: 'Barista / Cashier', person: 'Luis Reyes', subtitle: 'Barista · Shift A', initialPage: 'pos', pages: [['pos', 'Point of sale', '▣'], ['queue', 'Order queue', '◷'], ['receipts', 'Receipts', '▤']] },
  customer: { label: 'Customer', person: '', subtitle: '360 Rewards member', initialPage: 'home', pages: [['home', 'Home', '⌂'], ['menu', 'Menu', '☕'], ['orders', 'My orders', '◷'], ['wallet', 'Wallet & rewards', '◎'], ['account', 'Manage account', '♙'], ['branch', 'Pickup branch', '⌖']] },
};

const demoAccounts = [
  { id: 'admin-demo', name: 'Richard Dean Briones', email: 'admin@360degrees.cafe', password: 'admin123', role: 'admin' },
  { id: 'staff-demo', name: 'Luis Reyes', email: 'staff@360degrees.cafe', password: 'staff123', role: 'staff' },
  { id: 'customer-demo', name: 'Marco Rafaeles', email: 'customer@360degrees.cafe', password: 'customer123', role: 'customer', customerCode: 'CS-2026-0001' },
];

const initialOrders = [
  { id: 'SC-1844', customer: 'Marco Rafaeles', customerEmail: 'customer@360degrees.cafe', items: 'Sea Salt Cold Brew × 1', total: 215, status: 'Preparing', channel: 'Online' },
  { id: 'SC-1845', customer: 'Walk-in', customerEmail: '', items: 'Iced Spanish Latte × 2', total: 370, status: 'New', channel: 'Counter' },
  { id: 'SC-1846', customer: 'Ana Cruz', customerEmail: 'ana@example.com', items: 'Matcha Strawberry × 1', total: 225, status: 'Ready for pickup', channel: 'Online' },
];

const money = (amount) => `₱${Number(amount).toLocaleString('en-PH')}`;
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const toProduct = (product) => ({
  ...product,
  price: Number(product.price),
  stock: product.stock || 0,
  emoji: product.emoji || '☕',
  description: product.description || '',
  imageUrl: product.image_url || product.imageUrl || null,
});
const toPromotion = (promotion) => ({
  ...promotion,
  productId: promotion.product_id || promotion.productId || null,
  freeProductId: promotion.free_product_id || promotion.freeProductId || null,
  eligibleProductIds: promotion.eligible_product_ids || promotion.eligibleProductIds || [],
  branchIds: promotion.branch_ids || promotion.branchIds || [],
  promoType: promotion.promo_type || promotion.promoType || 'buy_x_get_y',
  buyQuantity: promotion.buy_quantity || promotion.buyQuantity || 1,
  getQuantity: promotion.get_quantity || promotion.getQuantity || 1,
  discountValue: Number(promotion.discount_value || promotion.discountValue || 0),
});

async function requestApi(path, options = {}) {
  if (!supabase || !apiUrl) throw new Error('Configure Supabase and EXPO_PUBLIC_API_URL first.');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}


export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState('');
  const [accounts, setAccounts] = useState(demoAccounts);
  const [catalogProducts, setCatalogProducts] = useState(products);
  const [promotions, setPromotions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [reportSummary, setReportSummary] = useState(null);
  const [role, setRole] = useState(null);
  const [page, setPage] = useState('overview');
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState(initialOrders);
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width < 700;
  const drawerWidth = Math.min(width * 0.82, 320);
  const drawerPosition = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const drawerHasOpened = useRef(false);
  const config = roleConfig[role];
  const isHeadAdmin = role === 'admin' || role === 'head_admin';
  const branchProducts = useMemo(() => catalogProducts.filter((product) => product.category !== 'Inventory'
    && (!product.branch_id || !activeBranchId || product.branch_id === activeBranchId)), [activeBranchId, catalogProducts]);
  const visibleProducts = useMemo(() => branchProducts.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())), [branchProducts, search]);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    const loadProducts = async () => {
      const [productResult, promotionResult] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('promotions').select('*').order('created_at', { ascending: false }),
      ]);
      if (productResult.error) {
        if (active) console.error('Product catalog lookup failure:', productResult.error.message);
        return;
      }
      if (active) setCatalogProducts(productResult.data.map(toProduct));
      if (promotionResult.error) {
        if (active) console.error('Promotion lookup failure:', promotionResult.error.message);
        return;
      }
      if (active) setPromotions(promotionResult.data.map(toPromotion));
    };
    loadProducts();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (role === 'customer') {
      if (!supabase) {
        const demoBranch = { id: 'demo-lipa', name: 'Lipa Branch', city: 'Lipa City', is_active: true };
        setBranches([demoBranch]);
        if (!user.branchId) setActiveBranchId((current) => current || demoBranch.id);
        return;
      }
      let active = true;
      supabase.from('branches').select('id,name,city,is_active').eq('is_active', true).order('name').then(({ data, error }) => {
        if (active && !error) {
          setBranches(data);
          if (!user.branchId) setActiveBranchId((current) => current || data[0]?.id || '');
        }
      });
      return () => { active = false; };
    }
    if (!['admin', 'head_admin', 'branch_admin', 'cashier', 'barista', 'staff'].includes(role)) return;
    if (!supabase) {
      const demoBranches = [{ id: 'demo-lipa', name: 'Lipa Branch', city: 'Lipa City', address: 'Lipa City, Batangas', is_active: true }, { id: 'demo-batangas-city', name: 'Batangas City', city: 'Batangas City', address: 'Batangas City, Batangas', is_active: true }];
      setBranches(demoBranches);
      if (role === 'branch_admin' || role === 'cashier' || role === 'barista' || role === 'staff') {
        setActiveBranchId((current) => current && current !== user.branchId ? user.branchId || current : user.branchId || current || 'demo-lipa');
      }
      return;
    }
    let active = true;
    requestApi('/api/admin/branches').then((data) => {
      if (!active) return;
      setBranches(data);
      if (role === 'branch_admin' || role === 'cashier' || role === 'barista' || role === 'staff') {
        const assignedBranch = user.branchId || data[0]?.id || '';
        setActiveBranchId((current) => (assignedBranch && current !== assignedBranch ? assignedBranch : current || assignedBranch));
      }
    }).catch((error) => {
      if (active) console.error('Branch loading failure:', error.message);
    });
    return () => { active = false; };
  }, [role, user]);

  useEffect(() => {
    if (!supabase || !user || !['admin', 'head_admin', 'branch_admin'].includes(role)) return;
    let active = true;
    requestApi('/api/admin/accounts').then((data) => {
      if (active) setAccounts(data.map((account) => ({
        ...account,
        name: account.full_name,
        contactNumber: account.contact_number || '',
        branchId: account.branch_id,
        isActive: account.is_active,
      })));
    }).catch((error) => {
      if (active) console.error('Employee list lookup failure:', error.message);
    });
    return () => { active = false; };
  }, [role, user]);

  useEffect(() => {
    if (!user || !['admin', 'head_admin', 'branch_admin'].includes(role)) return;
    if (!supabase) {
      setReportSummary({ sales: 84620, orders: 186, averageOrder: 455, customers: 91, lowStock: 2, inventoryValue: 23400, costOfGoods: 36600, grossProfit: 48020 });
      return;
    }
    let active = true;
    const query = activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : '';
    requestApi(`/api/admin/reports/summary${query}`).then((summary) => {
      if (active) setReportSummary(summary);
    }).catch((error) => {
      if (active) console.error('Report loading failure:', error.message);
    });
    return () => { active = false; };
  }, [activeBranchId, role, user]);

  useEffect(() => {
    if (!isMobile) {
      drawerPosition.setValue(0);
      backdropOpacity.setValue(0);
      return;
    }
    if (!menuOpen && !drawerHasOpened.current) {
      drawerPosition.setValue(-drawerWidth);
      backdropOpacity.setValue(0);
      return;
    }
    if (menuOpen) drawerHasOpened.current = true;
    Animated.parallel([
      Animated.spring(drawerPosition, {
        toValue: menuOpen ? 0 : -drawerWidth,
        useNativeDriver: true,
        damping: 24,
        stiffness: 220,
        mass: 0.8,
      }),
      Animated.timing(backdropOpacity, {
        toValue: menuOpen ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, drawerPosition, drawerWidth, isMobile, menuOpen]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (error) throw error;
          if (active && profile && roleConfig[profile.role]) {
            setUser({ id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, contactNumber: profile.contact_number || '', address: profile.address || '', customerCode: profile.customer_code, branchId: profile.branch_id });
            setRole(profile.role);
            setPage(roleConfig[profile.role].initialPage);
          }
        }
      } catch (error) {
        if (active) setAuthError(error.message || 'Unable to restore your account session.');
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, []);

  if (!user || !config) {
    if (authLoading) return <SafeAreaView style={styles.authSafeArea}><Text style={styles.authSubtitle}>Loading your account...</Text></SafeAreaView>;
    return <AuthScreen accounts={supabase ? [] : accounts} authError={authError} onLogin={async (account) => {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
        if (error) throw new Error('Email or password is incorrect.');
        const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
        if (profileError) throw profileError;
        if (!profile || !roleConfig[profile.role]) throw new Error('Your account profile is incomplete. Contact an administrator.');
        if (profile.is_active === false) throw new Error('This account is inactive. Contact a head administrator.');
        const signedIn = { id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, contactNumber: profile.contact_number || '', address: profile.address || '', customerCode: profile.customer_code, branchId: profile.branch_id };
        setUser(signedIn); setRole(signedIn.role); setPage(roleConfig[signedIn.role].initialPage);
      } else {
        setUser(account); setRole(account.role); setPage(roleConfig[account.role].initialPage);
      }
    }} onRegister={async (account) => {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: account.email,
          password: account.password,
          options: { data: { full_name: account.name, contact_number: account.contactNumber } },
        });
        if (error) throw error;
        if (!data.session) throw new Error('Registration succeeded. Confirm your email before signing in.');
        const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
        if (profileError) throw profileError;
        const registered = { ...account, customerCode: profile.customer_code, id: profile.id };
        setUser(registered); setRole('customer'); setPage(roleConfig.customer.initialPage);
      } else {
        setAccounts((current) => [...current, account]); setUser(account); setRole(account.role); setPage(roleConfig[account.role].initialPage);
      }
    }} />;
  }

  const addToCart = (product) => setCart((current) => {
    const existing = current.find((line) => line.id === product.id);
    return existing ? current.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)) : [...current, { ...product, quantity: 1 }];
  });
  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null); setRole(null); setPage('overview'); setCart([]); setSearch('');
  };
  const saveAccountProfile = async ({ fullName, contactNumber, address }) => {
    if (supabase) {
      if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address to manage your account.');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fullName, contactNumber, address }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update account details.');
      setUser((current) => ({ ...current, name: result.full_name, contactNumber: result.contact_number, address: result.address || '' }));
      return;
    }
    setUser((current) => ({ ...current, name: fullName, contactNumber, address }));
    setAccounts((current) => current.map((account) => account.id === user.id ? { ...account, name: fullName, contactNumber, address } : account));
  };
  const changeAccountPassword = async (newPassword) => {
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return;
    }
    setUser((current) => ({ ...current, password: newPassword }));
    setAccounts((current) => current.map((account) => account.id === user.id ? { ...account, password: newPassword } : account));
  };
  const recordActivity = async (action, entityType, entityId, details = {}, branchId = activeBranchId || user.branchId || null) => {
    if (!supabase) return;
    const { error } = await supabase.from('activity_logs').insert({ actor_id: user.id, branch_id: branchId, action, entity_type: entityType, entity_id: String(entityId), details });
    if (error) console.error('Activity log write failure:', error.message);
  };
  const createProduct = async ({ name, category, price, unitCost, initialStock, description, photo, branchId }) => {
    let imageUrl = photo.uri;
    if (supabase) {
      const imageResponse = await fetch(photo.uri);
      if (!imageResponse.ok) throw new Error('Unable to read the selected product photo.');
      const imageBlob = await imageResponse.blob();
      const extension = (photo.fileName?.split('.').pop() || photo.mimeType?.split('/').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const imagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const { data: uploadedImage, error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(imagePath, imageBlob, { contentType: photo.mimeType || imageBlob.type || 'image/jpeg', cacheControl: '3600' });
      if (uploadError) throw uploadError;
      imageUrl = supabase.storage.from('product-images').getPublicUrl(uploadedImage.path).data.publicUrl;
      const { data, error } = await supabase.from('products').insert({
        name,
        category,
        branch_id: branchId || null,
        price: Number(price),
        unit_cost: Number(unitCost),
        description,
        image_url: imageUrl,
        emoji: '☕',
        is_available: true,
      }).select().single();
      if (error) {
        await supabase.storage.from('product-images').remove([uploadedImage.path]);
        throw error;
      }
      const branchResult = branchId
        ? { data: [{ id: branchId }], error: null }
        : await supabase.from('branches').select('id').eq('is_active', true);
      if (branchResult.error || !branchResult.data.length) {
        await supabase.from('products').delete().eq('id', data.id);
        await supabase.storage.from('product-images').remove([uploadedImage.path]);
        throw branchResult.error || new Error('No active branches are available for initial stock.');
      }
      const stockRows = branchResult.data.map((branch) => ({
        product_id: data.id,
        branch_id: branch.id,
        name,
        sku: `PRD-${data.id.slice(0, 8)}-${branch.id.slice(0, 4)}`,
        unit: 'unit',
        quantity: initialStock,
        low_stock_threshold: 5,
        unit_cost: Number(unitCost),
      }));
      const { error: stockError } = await supabase.from('inventory').insert(stockRows);
      if (stockError) {
        await supabase.from('products').delete().eq('id', data.id);
        await supabase.storage.from('product-images').remove([uploadedImage.path]);
        throw stockError;
      }
      setCatalogProducts((current) => [toProduct(data), ...current]);
      await recordActivity('product.created', 'product', data.id, { name, category, price, unitCost }, branchId);
      return;
    }
    setCatalogProducts((current) => [{
      id: `demo-product-${Date.now()}`,
      name,
      category,
      branch_id: branchId || null,
      price: Number(price),
      unit_cost: Number(unitCost),
      stock: initialStock,
      description,
      imageUrl,
      emoji: '☕',
      stock: 0,
    }, ...current]);
    await recordActivity('product.created', 'product', name, { name, category, price, unitCost }, branchId);
  };
  const deleteProduct = async (product) => {
    if (supabase) {
      const { error: inventoryError } = await supabase.from('inventory').delete().eq('product_id', product.id);
      if (inventoryError) throw inventoryError;
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
      const imagePath = product.imageUrl?.split('/storage/v1/object/public/product-images/')[1]?.split('?')[0];
      if (imagePath) {
        const { error: imageError } = await supabase.storage.from('product-images').remove([decodeURIComponent(imagePath)]);
        if (imageError) console.warn('Product image cleanup failure:', imageError.message);
      }
    }
    setCatalogProducts((current) => current.filter((item) => item.id !== product.id));
    setPromotions((current) => current.map((promotion) => promotion.productId === product.id ? { ...promotion, productId: null } : promotion));
    await recordActivity('product.deleted', 'product', product.id, { name: product.name }, product.branch_id);
  };
  const createPromotion = async ({ title, description, productId, promoType, buyQuantity, getQuantity, discountValue, branchId }) => {
    const promotion = { id: `demo-promotion-${Date.now()}`, title, description, productId: productId || null, promoType, buyQuantity, getQuantity, discountValue, branchIds: branchId ? [branchId] : [], is_active: true };
    if (supabase) {
      const { data, error } = await supabase.from('promotions').insert({
        title,
        description,
        product_id: productId || null,
        promo_type: promoType,
        buy_quantity: buyQuantity,
        get_quantity: getQuantity,
        discount_value: discountValue,
        branch_ids: branchId ? [branchId] : [],
        is_active: true,
      }).select().single();
      if (error) throw error;
      setPromotions((current) => [toPromotion(data), ...current]);
      await recordActivity('promotion.created', 'promotion', data.id, { title, promoType, productId, branchId }, branchId);
      return;
    }
    setPromotions((current) => [promotion, ...current]);
    await recordActivity('promotion.created', 'promotion', promotion.id, { title, promoType, productId, branchId }, branchId);
  };
  const deletePromotion = async (promotion) => {
    if (supabase) {
      const { error } = await supabase.from('promotions').delete().eq('id', promotion.id);
      if (error) throw error;
    }
    setPromotions((current) => current.filter((item) => item.id !== promotion.id));
    await recordActivity('promotion.deleted', 'promotion', promotion.id, { title: promotion.title }, null);
  };
  const createBranch = async (branch) => {
    const created = supabase
      ? await requestApi('/api/admin/branches', { method: 'POST', body: JSON.stringify(branch) })
      : { ...branch, id: `demo-branch-${Date.now()}`, is_active: true };
    setBranches((current) => [...current, created]);
    return created;
  };
  const toggleBranch = async (branch) => {
    const updated = supabase
      ? await requestApi(`/api/admin/branches/${branch.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !branch.is_active }) })
      : { ...branch, is_active: !branch.is_active };
    setBranches((current) => current.map((item) => item.id === branch.id ? updated : item));
    return updated;
  };
  const saveLoyaltySettings = async (settings) => {
    if (supabase) {
      const { error } = await supabase.from('loyalty_settings').upsert({ id: 1, ...settings, updated_by: user.id, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    await recordActivity('loyalty.rules_updated', 'loyalty_settings', '1', settings, null);
  };
  const redeemReward = async (rewardId) => requestApi('/api/loyalty/redeem', { method: 'POST', body: JSON.stringify({ rewardId }) });
  const placePosOrder = async (customerCode) => {
    if (!cart.length) return;
    setCheckoutNotice('');
    if (supabase) {
      const result = await requestApi('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({ branchId: activeBranchId || user.branchId, customerCode, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      });
      setOrders((current) => [{ ...result.order, id: result.order.id, customer: customerCode || 'Walk-in', items: result.items.map((item) => `${item.product_name} × ${item.quantity}`).join(', '), promotionTitle: result.promotion?.title, status: 'New' }, ...current]);
      setCheckoutNotice(`${result.promotion?.title ? `${result.promotion.title} applied. ` : ''}${result.pointsEarned ? `${result.pointsEarned} loyalty points earned.` : 'Sale completed.'}`);
      setCart([]);
      return result;
    }
    const preview = previewPromotion(cart, promotions, activeBranchId);
    setOrders((current) => [{ id: `SC-${1847 + current.length}`, customer: customerCode || 'Walk-in', items: preview.items.map((item) => `${item.name} × ${item.quantity}`).join(', '), total: preview.total, status: 'New' }, ...current]);
    setCheckoutNotice(`${preview.promotion?.title ? `${preview.promotion.title} applied. ` : ''}Sale completed.`);
    setCart([]);
  };
  const placeOrder = async () => {
    if (!cart.length) return;
    if (supabase) {
      const branchId = activeBranchId || user.branchId || branches[0]?.id;
      if (!branchId) return setCheckoutNotice('Choose an active branch before placing your order.');
      try {
        const result = await requestApi('/api/pos/checkout', {
          method: 'POST',
          body: JSON.stringify({ branchId, customerCode: user.customerCode, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
        });
        setOrders((current) => [{ ...result.order, items: result.items.map((item) => `${item.product_name} × ${item.quantity}`).join(', '), customer: user.name, customerEmail: user.email, promotionTitle: result.promotion?.title, status: 'New' }, ...current]);
        setCheckoutNotice(`${result.promotion?.title ? `${result.promotion.title} applied. ` : ''}${result.pointsEarned ? `${result.pointsEarned} points earned.` : 'Order placed.'}`);
        setCart([]);
      } catch (orderError) { setCheckoutNotice(orderError.message || 'Unable to place order.'); }
      return;
    }
    const order = {
      id: `SC-${1847 + orders.length}`,
      customer: user.name,
      customerEmail: user.email,
      items: cart.map((item) => `${item.name} × ${item.quantity}`).join(', '),
      total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status: 'New',
      channel: 'Online',
    };
    setOrders((current) => [order, ...current]);
    setCart([]);
    Alert.alert('Order placed', 'Your pickup order is being prepared.');
  };
  const updateOrderStatus = (orderId, status) => {
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
    if (status === 'Ready for pickup') Alert.alert('Customer notified', 'The customer can now see that the order is ready for pickup.');
  };
  const navigate = (nextPage) => {
    const allowedPage = config.pages.some(([id]) => id === nextPage) ? nextPage : config.initialPage;
    setPage(allowedPage);
    setMenuOpen(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.app, isMobile && styles.appMobile]}>
        {isMobile && <Animated.View pointerEvents={menuOpen ? 'auto' : 'none'} style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.drawerBackdropPressable} onPress={() => setMenuOpen(false)} accessibilityLabel="Close navigation menu" />
        </Animated.View>}
        <Animated.View style={[styles.sidebar, isMobile && styles.sidebarMobile, isMobile && { width: drawerWidth, transform: [{ translateX: drawerPosition }] }]}>
          <View style={styles.brand}><Text style={styles.brandMark}>360</Text><View style={styles.brandDetails}><Text style={styles.brandName}>360 Degrees Specialty Cafe</Text><Text style={styles.branch}>LIPA BRANCH</Text></View>{isMobile && <Pressable onPress={() => setMenuOpen(false)} style={styles.closeButton} accessibilityLabel="Close navigation menu"><Text style={styles.closeIcon}>×</Text></Pressable>}</View>
          <Text style={styles.label}>{role === 'customer' ? 'Your coffee shop' : `${config.label} workspace`}</Text>
          <View style={styles.nav}>{config.pages.map(([id, label, icon]) => <Pressable key={id} onPress={() => navigate(id)} style={[styles.navButton, page === id && styles.navButtonActive]}><Text style={styles.navIcon}>{icon}</Text><Text style={[styles.navText, page === id && styles.navTextActive]}>{label}</Text></Pressable>)}</View>
          <View style={styles.sidebarFooter}><Text style={styles.store}>Lipa Branch · Lipa City</Text><Text style={styles.sidebarMuted}>Open today until 10:00 PM</Text><Text style={styles.person}>{user.name}</Text><Text style={styles.sidebarMuted}>{config.subtitle}</Text><Pressable onPress={signOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable></View>
        </Animated.View>
        <View style={styles.main}>
          {isMobile && <View style={styles.mobileHeader}><Pressable onPress={() => setMenuOpen((open) => !open)} style={styles.menuButton} accessibilityLabel="Open navigation menu"><Text style={styles.menuIcon}>☰</Text></Pressable><View style={styles.mobileBrand}><Text style={styles.mobileBrandMark}>360</Text><View><Text style={styles.mobileBrandName}>360 Degrees Specialty Cafe</Text><Text style={styles.mobileBranch}>LIPA BRANCH</Text></View></View></View>}
          <View style={[styles.topbar, isMobile && styles.topbarMobile]}><Text style={styles.breadcrumb}>360 Degrees Specialty Cafe  /  {config.pages.find(([id]) => id === page)?.[1]}</Text><View style={styles.topbarActions}><Pressable style={styles.location} onPress={() => (isHeadAdmin ? navigate('branches') : role === 'customer' ? navigate('branch') : null)}><Text>{activeBranchId ? `⌖  ${branches.find((branch) => branch.id === activeBranchId)?.name || 'Selected branch'}` : isHeadAdmin ? '⌖  All branches' : '⌖  Assigned branch'}</Text></Pressable></View></View>
          <ScrollView contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}>
            {page === 'overview' && <AdminOverview summary={reportSummary} onNavigate={navigate} />}
            {page === 'branches' && <Branches branches={branches} selectedBranchId={activeBranchId} onSelectBranch={setActiveBranchId} onCreateBranch={createBranch} onToggleBranch={toggleBranch} />}
            {page === 'inventory' && <Inventory branchId={activeBranchId || user.branchId} isHeadAdmin={isHeadAdmin} />}
            {page === 'products' && <AdminProducts products={catalogProducts} branches={branches} defaultBranchId={user.branchId || activeBranchId} isHeadAdmin={isHeadAdmin} onCreateProduct={createProduct} onDeleteProduct={deleteProduct} />}
            {page === 'promotions' && <Promotions promotions={promotions} products={catalogProducts.filter((product) => product.category !== 'Inventory')} branches={branches} defaultBranchId={user.branchId || activeBranchId} isHeadAdmin={isHeadAdmin} onCreatePromotion={createPromotion} onDeletePromotion={deletePromotion} />}
            {page === 'reports' && <Reports summary={reportSummary} branches={branches} selectedBranchId={activeBranchId} onSelectBranch={setActiveBranchId} isHeadAdmin={isHeadAdmin} />}
            {page === 'loyalty' && <LoyaltyAdmin onSave={saveLoyaltySettings} />}
            {page === 'audit' && <AuditLogs branchId={activeBranchId} />}
            {page === 'team' && <TeamAccounts accounts={accounts} branches={branches} isHeadAdmin={isHeadAdmin} branchId={user.branchId || activeBranchId} onCreate={(account) => setAccounts((current) => [...current, account])} onToggleAccount={async (account) => {
              const updated = supabase ? await requestApi(`/api/admin/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !account.isActive }) }) : { ...account, isActive: !account.isActive };
              setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, ...updated, isActive: updated.is_active ?? updated.isActive } : item));
            }} />}
            {page === 'pos' && <Pos visibleProducts={visibleProducts} promotions={promotions} branchId={activeBranchId || user.branchId} checkoutNotice={checkoutNotice} search={search} setSearch={setSearch} cart={cart} onAdd={addToCart} onPlaceOrder={placePosOrder} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0))} />}
            {page === 'queue' && <Queue orders={orders} onUpdateStatus={updateOrderStatus} />}
            {page === 'receipts' && <Receipts orders={orders} />}
            {page === 'home' && <CustomerHome products={branchProducts} promotions={promotions} branchId={activeBranchId} branches={branches} checkoutNotice={checkoutNotice} user={user} orders={orders} onNavigate={navigate} onAdd={addToCart} cart={cart} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0))} onPlaceOrder={placeOrder} />}
            {page === 'menu' && <Products visibleProducts={visibleProducts} search={search} setSearch={setSearch} onAdd={addToCart} cart={cart} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0))} onPlaceOrder={placeOrder} />}
            {page === 'orders' && <Orders orders={orders} user={user} />}
            {page === 'wallet' && <Wallet user={user} onRedeem={redeemReward} />}
            {page === 'account' && <ManageAccount user={user} onSaveProfile={saveAccountProfile} onChangePassword={changeAccountPassword} />}
            {page === 'branch' && <BranchPicker branches={branches.filter((branch) => branch.is_active !== false)} selectedBranchId={activeBranchId} onSelectBranch={(id) => { setActiveBranchId(id); navigate('home'); }} />}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function AuthScreen({ accounts, authError, onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'register') {
      if (!name.trim()) return setError('Enter your full name.');
      if (!contactNumber.trim()) return setError('Enter a contact number.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
      if (accounts.some((account) => account.email === normalizedEmail)) return setError('An account with this email already exists.');
      return onRegister({ id: `customer-${Date.now()}`, name: name.trim(), email: normalizedEmail, password, role: 'customer', contactNumber: contactNumber.trim(), customerCode: `CS-${new Date().getFullYear()}-${String(accounts.filter((account) => account.role === 'customer').length + 1).padStart(4, '0')}` }).catch((submitError) => setError(submitError.message));
    }
    const account = accounts.find((item) => item.email === normalizedEmail && item.password === password);
    if (!account) return setError('Email or password is incorrect.');
    return onLogin(account).catch((submitError) => setError(submitError.message));
  };

  const switchMode = () => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); };
  return <SafeAreaView style={styles.authSafeArea}>
    <ScrollView contentContainerStyle={styles.authPage}>
      <View style={styles.authCard}>
        <View style={styles.authBrand}>
          <Text style={styles.brandMark}>360</Text>
          <View>
            <Text style={styles.brandNameDark}>360 Degrees Specialty Cafe</Text>
            <Text style={styles.branchDark}>LIPA BRANCH</Text>
          </View>
        </View>
        <View style={styles.authTabs}>
          <Pressable onPress={() => { setMode('login'); setError(''); }} style={[styles.authTab, mode === 'login' && styles.authTabActive]}>
            <Text style={[styles.authTabText, mode === 'login' && styles.authTabTextActive]}>Login</Text>
          </Pressable>
          <Pressable onPress={() => { setMode('register'); setError(''); }} style={[styles.authTab, mode === 'register' && styles.authTabActive]}>
            <Text style={[styles.authTabText, mode === 'register' && styles.authTabTextActive]}>Register</Text>
          </Pressable>
        </View>
        <Text style={styles.eyebrow}>{mode === 'login' ? 'Welcome back' : 'Join 360 rewards'}</Text>
        <Text style={styles.authTitle}>{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</Text>
        <Text style={styles.authSubtitle}>{mode === 'login' ? 'Use your account to access the workspace assigned to you.' : 'New accounts start as customer accounts.'}</Text>
        {mode === 'register' && <TextInput value={name} onChangeText={setName} placeholder="Full name *" autoCapitalize="words" style={styles.authInput} />}
        <TextInput value={email} onChangeText={setEmail} placeholder="Email address" autoCapitalize="none" keyboardType="email-address" style={styles.authInput} />
        {mode === 'register' && <TextInput value={contactNumber} onChangeText={setContactNumber} placeholder="Contact number *" keyboardType="phone-pad" style={styles.authInput} />}
        <PasswordInput value={password} onChangeText={setPassword} placeholder="Password (8+ characters)" visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} />
        {mode === 'register' && <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} />}
        {authError ? <Text style={styles.formError}>{authError}</Text> : null}
        {error ? <Text style={styles.formError}>{error}</Text> : null}
        <Pressable style={styles.authButton} onPress={submit}>
          <Text style={styles.buttonText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
        </Pressable>
        {mode === 'login' && <Text style={styles.demoHint}>Demo: admin@360degrees.cafe / admin123</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function PasswordInput({ value, onChangeText, placeholder, visible, onToggle }) {
  return <View style={styles.passwordInputWrapper}><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} secureTextEntry={!visible} style={styles.passwordInput} /><Pressable onPress={onToggle} style={styles.passwordToggle} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}><Text style={styles.passwordToggleText}>{visible ? 'Hide' : 'Show'}</Text></Pressable></View>;
}

function TeamAccounts({ accounts, branches, isHeadAdmin, branchId: assignedBranchId, onCreate, onToggleAccount }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountRole, setAccountRole] = useState(isHeadAdmin ? 'branch_admin' : 'cashier');
  const [branchId, setBranchId] = useState(assignedBranchId || '');
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const roles = isHeadAdmin ? ['branch_admin', 'cashier', 'barista', 'customer'] : ['cashier', 'barista'];
  const roleLabel = (value) => ({ admin: 'Head Admin', head_admin: 'Head Admin', branch_admin: 'Branch Admin', cashier: 'Cashier', barista: 'Barista', staff: 'Staff', customer: 'Customer' })[value] || value;
  const createAccount = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim()) return setError('Enter the account holder’s full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (!contactNumber.trim()) return setError('Enter a contact number.');
    if (!address.trim()) return setError('Enter an address.');
    if (accountRole !== 'customer' && !branchId) return setError('Assign the employee to a branch.');
    if (accounts.some((account) => account.email.toLowerCase() === normalizedEmail)) return setError('This email is already assigned to an account.');
    setCreating(true);
    setError('');
    try {
      let account = {
        id: `${accountRole}-${Date.now()}`,
        name: name.trim(),
        email: normalizedEmail,
        password,
        role: accountRole,
        branchId: accountRole === 'customer' ? null : (isHeadAdmin ? branchId : assignedBranchId),
        contactNumber: contactNumber.trim(),
        address: address.trim(),
      };
      if (supabase) {
        if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address to create accounts.');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) throw new Error('Your admin session has expired. Sign in again.');
        const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/admin/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            fullName: account.name,
            email: account.email,
            password: account.password,
            role: account.role,
            branchId: account.branchId,
            contactNumber: account.contactNumber,
            address: account.address,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to create account.');
        account = {
          id: result.id,
          name: result.full_name,
          email: result.email,
          role: result.role,
          branchId: result.branch_id,
          isActive: result.is_active,
          contactNumber: result.contact_number,
          address: result.address,
        };
      }
      onCreate(account);
      setName('');
      setEmail('');
      setPassword('');
      setShowTemporaryPassword(false);
      setContactNumber('');
      setAddress('');
      Alert.alert('Account created', `The ${accountRole} account can now sign in with this email and password.`);
    } catch (submitError) {
      setError(submitError.message || 'Unable to create account.');
    } finally {
      setCreating(false);
    }
  };
  return <>
    <Header eyebrow="Admin controls" title="Team accounts" subtitle="Create staff or customer accounts with complete contact details." />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>New employee or customer</Text>
      <Text style={styles.fieldLabel}>Account type</Text>
      <View style={styles.roleDropdown}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: roleMenuOpen }}
          onPress={() => setRoleMenuOpen((open) => !open)}
          style={styles.roleDropdownTrigger}
        >
          <Text style={styles.roleDropdownValue}>{roleLabel(accountRole)}</Text>
          <Text style={styles.roleDropdownChevron}>{roleMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {roleMenuOpen && <View style={styles.roleDropdownMenu}>
          {roles.map((roleOption) => (
            <Pressable
              key={roleOption}
              onPress={() => { setAccountRole(roleOption); setRoleMenuOpen(false); }}
              style={[styles.roleDropdownOption, accountRole === roleOption && styles.roleDropdownOptionSelected]}
            >
              <Text style={[styles.roleDropdownOptionText, accountRole === roleOption && styles.roleDropdownOptionTextSelected]}>
                {roleLabel(roleOption)}
              </Text>
            </Pressable>
          ))}
        </View>}
      </View>
      {isHeadAdmin && accountRole !== 'customer' && <>
        <Text style={styles.fieldLabel}>Assigned branch</Text>
        <View style={styles.roleDropdown}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: branchMenuOpen }} onPress={() => setBranchMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
            <Text style={styles.roleDropdownValue}>{branches.find((branch) => branch.id === branchId)?.name || 'Choose branch'}</Text><Text style={styles.roleDropdownChevron}>{branchMenuOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {branchMenuOpen && <View style={styles.roleDropdownMenu}>{branches.filter((branch) => branch.is_active).map((branch) => <Pressable key={branch.id} onPress={() => { setBranchId(branch.id); setBranchMenuOpen(false); }} style={styles.roleDropdownOption}><Text style={styles.roleDropdownOptionText}>{branch.name}</Text></Pressable>)}</View>}
        </View>
      </>}
      {!isHeadAdmin && <Text style={styles.subtitle}>Assigned branch: {branches.find((branch) => branch.id === assignedBranchId)?.name || 'Current branch'}</Text>}
      <TextInput value={name} onChangeText={setName} placeholder="Full name *" style={styles.authInput} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Unique email address *" autoCapitalize="none" keyboardType="email-address" style={styles.authInput} />
      <PasswordInput value={password} onChangeText={setPassword} placeholder="Temporary password (8+ characters) *" visible={showTemporaryPassword} onToggle={() => setShowTemporaryPassword((visible) => !visible)} />
      <TextInput value={contactNumber} onChangeText={setContactNumber} placeholder="Contact number *" keyboardType="phone-pad" style={styles.authInput} />
      <TextInput value={address} onChangeText={setAddress} placeholder="Complete address *" multiline style={[styles.authInput, styles.addressInput]} />
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Pressable disabled={creating} style={[styles.buttonDark, creating && styles.disabled]} onPress={createAccount}>
        <Text style={styles.buttonText}>Create an Account</Text>
      </Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Registered accounts</Text>
      {accounts.map((account) => <View style={styles.accountRow} key={account.id}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{account.name}</Text>
          <Text style={styles.subtitle}>{account.email}</Text>
          {account.contactNumber ? <Text style={styles.subtitle}>{account.contactNumber} · {account.address}</Text> : null}
        </View>
        <View style={styles.flex}><Text style={styles.pill}>{roleLabel(account.role)}</Text><Text style={styles.subtitle}>{branches.find((branch) => branch.id === (account.branchId || account.branch_id))?.name || (account.role === 'customer' ? 'Customer' : '')}</Text></View>
        {onToggleAccount && !['admin', 'head_admin', 'customer'].includes(account.role) && <Pressable style={styles.deleteButton} onPress={() => onToggleAccount(account)}><Text style={styles.deleteButtonText}>{account.isActive === false || account.is_active === false ? 'Activate' : 'Deactivate'}</Text></Pressable>}
      </View>)}
    </View>
  </>;
}

function Header({ eyebrow, title, subtitle }) {
  return <View style={styles.heading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>;
}
function Stat({ label, value, note }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.statNote}>{note}</Text></View>;
}
function AdminOverview({ summary, onNavigate }) {
  return <><Header eyebrow="Head office · Operations" title="Branch overview" subtitle="Live operating metrics across your selected branch scope." /><View style={styles.stats}><Stat label="Sales" value={money(summary?.sales || 0)} note={`${summary?.orders || 0} orders`} /><Stat label="Average order" value={money(summary?.averageOrder || 0)} note="Across selected branches" /><Stat label="Gross profit" value={money(summary?.grossProfit || 0)} note={`Cost of goods ${money(summary?.costOfGoods || 0)}`} /><Stat label="Low-stock items" value={String(summary?.lowStock || 0)} note={`Inventory value ${money(summary?.inventoryValue || 0)}`} /></View><View style={styles.card}><Text style={styles.cardTitle}>Head office controls</Text><Pressable style={styles.buttonSecondary} onPress={() => onNavigate('branches')}><Text>Manage branches</Text></Pressable><Pressable style={styles.buttonSecondary} onPress={() => onNavigate('reports')}><Text>Open consolidated reports</Text></Pressable><Pressable style={styles.buttonSecondary} onPress={() => onNavigate('team')}><Text>Manage employee accounts</Text></Pressable></View></>;
}
function Branches({ branches, selectedBranchId, onSelectBranch, onCreateBranch, onToggleBranch }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  useEffect(() => { setCanManage(Boolean(supabase) ? true : true); }, []);
  const create = async () => {
    if (!name.trim() || !city.trim()) return setError('Enter the branch name and city.');
    setSaving(true);
    setError('');
    try {
      const branch = await onCreateBranch({ name: name.trim(), city: city.trim(), address: address.trim() });
      onSelectBranch(branch.id);
      setName(''); setCity(''); setAddress('');
    } catch (saveError) { setError(saveError.message || 'Unable to create branch.'); }
    finally { setSaving(false); }
  };
  return <>
    <Header eyebrow="Head office" title="Branches" subtitle="Create, activate, and select branch workspaces." />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>All branches</Text>
      <Pressable style={[styles.branchRow, !selectedBranchId && styles.branchRowActive]} onPress={() => onSelectBranch('')}>
        <View style={styles.flex}><Text style={styles.cardTitle}>All branches</Text><Text style={styles.subtitle}>Combined dashboard and reporting</Text></View>
        {!selectedBranchId && <Text style={styles.pill}>Selected</Text>}
      </Pressable>
      {branches.map((branch) => <View style={styles.branchRow} key={branch.id}>
        <Pressable style={styles.flex} onPress={() => onSelectBranch(branch.id)}>
          <Text style={styles.cardTitle}>{branch.name}</Text><Text style={styles.subtitle}>{branch.city} · {branch.address || 'No address'}</Text>
        </Pressable>
        <Text style={styles.pill}>{branch.is_active ? 'Active' : 'Inactive'}</Text>
        <Pressable style={styles.smallButton} onPress={() => onSelectBranch(branch.id)}><Text style={styles.buttonText}>View</Text></Pressable>
        {canManage && <Pressable style={styles.deleteButton} onPress={() => onToggleBranch(branch)}><Text style={styles.deleteButtonText}>{branch.is_active ? 'Deactivate' : 'Activate'}</Text></Pressable>}
      </View>)}
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add branch</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Branch name *" style={styles.authInput} />
      <TextInput value={city} onChangeText={setCity} placeholder="City *" style={styles.authInput} />
      <TextInput value={address} onChangeText={setAddress} placeholder="Address" style={styles.authInput} />
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Pressable disabled={saving} style={[styles.buttonDark, saving && styles.disabled]} onPress={create}><Text style={styles.buttonText}>{saving ? 'Creating...' : 'Create branch'}</Text></Pressable>
    </View>
  </>;
}

function BranchPicker({ branches, selectedBranchId, onSelectBranch }) {
  return <>
    <Header eyebrow="Pickup location" title="Choose a branch" subtitle="Menu items and promotions update for your selected shop." />
    <View style={styles.card}>{branches.length ? branches.map((branch) => <Pressable key={branch.id} style={[styles.branchRow, selectedBranchId === branch.id && styles.branchRowActive]} onPress={() => onSelectBranch(branch.id)}>
      <View style={styles.flex}><Text style={styles.cardTitle}>{branch.name}</Text><Text style={styles.subtitle}>{branch.city || ''}{branch.address ? ` · ${branch.address}` : ''}</Text></View>
      {selectedBranchId === branch.id && <Text style={styles.pill}>Selected</Text>}
    </Pressable>) : <Text style={styles.subtitle}>No active branches are available.</Text>}</View>
  </>;
}

function AuditLogs({ branchId }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    requestApi(`/api/admin/audit${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`).then((data) => {
      if (active) setLogs(data);
    }).catch((loadError) => { if (active) setError(loadError.message || 'Unable to load audit logs.'); });
    return () => { active = false; };
  }, [branchId]);
  return <>
    <Header eyebrow="Administrative oversight" title="Activity log" subtitle="Recent account, branch, inventory, POS, and loyalty actions." />
    <View style={styles.card}>{error ? <Text style={styles.formError}>{error}</Text> : null}
      {logs.length ? logs.map((entry) => <View style={styles.accountRow} key={entry.id}>
        <View style={styles.flex}><Text style={styles.cardTitle}>{entry.action}</Text><Text style={styles.subtitle}>{entry.profiles?.full_name || 'System'} · {entry.entity_type} {entry.entity_id || ''}</Text><Text style={styles.subtitle}>{new Date(entry.created_at).toLocaleString()}</Text>{Object.keys(entry.details || {}).length > 0 && <Text style={styles.auditDetails}>{JSON.stringify(entry.details)}</Text>}</View>
        {entry.branch_id ? <Text style={styles.pill}>{entry.branch_id.slice(0, 8)}</Text> : null}
      </View>) : <Text style={styles.subtitle}>No activity recorded yet.</Text>}
    </View>
  </>;
}

function LoyaltyRuleInput({ value, onChangeText, placeholder, description, keyboardType }) {
  const [isFocused, setIsFocused] = useState(false);
  return <View style={styles.loyaltyInputWrapper}>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={[styles.authInput, styles.loyaltyRuleInput]}
    />
    {!isFocused && <Text pointerEvents="none" style={styles.loyaltyInputDescription}>{description}</Text>}
  </View>;
}

function LoyaltyAdmin({ onSave }) {
  const [pointsPerAmount, setPointsPerAmount] = useState('1');
  const [amountPerPoint, setAmountPerPoint] = useState('100');
  const [expirationDays, setExpirationDays] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [rewardPoints, setRewardPoints] = useState('');
  const [rewards, setRewards] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!supabase) return;
    Promise.all([supabase.from('loyalty_settings').select('*').eq('id', 1).single(), supabase.from('rewards').select('*').order('points_required')])
      .then(([settingsResult, rewardsResult]) => {
        if (!settingsResult.error) {
          setPointsPerAmount(String(settingsResult.data.points_per_amount));
          setAmountPerPoint(String(settingsResult.data.amount_per_point));
          setExpirationDays(settingsResult.data.expiration_days ? String(settingsResult.data.expiration_days) : '');
        }
        if (!rewardsResult.error) setRewards(rewardsResult.data);
      });
  }, []);
  const save = async () => {
    if (Number(pointsPerAmount) < 1 || Number(amountPerPoint) <= 0) return setError('Enter valid point earning values.');
    try {
      await onSave({ points_per_amount: Number(pointsPerAmount), amount_per_point: Number(amountPerPoint), expiration_days: expirationDays ? Number(expirationDays) : null });
      setNotice('Loyalty rules saved.'); setError('');
    } catch (saveError) { setError(saveError.message || 'Unable to save loyalty rules.'); }
  };
  const addReward = async () => {
    if (!rewardName.trim() || Number(rewardPoints) < 1) return setError('Enter a reward name and point threshold.');
    if (supabase) {
      const { data, error: insertError } = await supabase.from('rewards').insert({ name: rewardName.trim(), points_required: Number(rewardPoints) }).select().single();
      if (insertError) return setError(insertError.message);
      setRewards((current) => [...current, data]);
    } else setRewards((current) => [...current, { id: `${Date.now()}`, name: rewardName.trim(), points_required: Number(rewardPoints), is_active: true }]);
    setRewardName(''); setRewardPoints(''); setNotice('Reward added.');
  };
  return <>
    <Header eyebrow="Rewards configuration" title="Loyalty rules" subtitle="Set earning rates, expiration, and reward thresholds." />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Points earning</Text>
      <LoyaltyRuleInput value={pointsPerAmount} onChangeText={setPointsPerAmount} placeholder="Points earned *" description={`Points awarded for each ${amountPerPoint ? `₱${amountPerPoint}` : 'spend amount'} spent`} keyboardType="number-pad" />
      <LoyaltyRuleInput value={amountPerPoint} onChangeText={setAmountPerPoint} placeholder="Spend amount per point *" description="Spend required to earn each point" keyboardType="decimal-pad" />
      <LoyaltyRuleInput value={expirationDays} onChangeText={setExpirationDays} placeholder="Point expiration days (blank = never)" description="Days before points expire; blank means never" keyboardType="number-pad" />
      <Pressable style={styles.buttonDark} onPress={save}><Text style={styles.buttonText}>Save loyalty rules</Text></Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Rewards</Text>
      <TextInput value={rewardName} onChangeText={setRewardName} placeholder="Reward name" style={styles.authInput} />
      <TextInput value={rewardPoints} onChangeText={setRewardPoints} placeholder="Points required" keyboardType="number-pad" style={styles.authInput} />
      <Pressable style={styles.buttonSecondary} onPress={addReward}><Text>Add reward</Text></Pressable>
      {rewards.map((reward) => <View style={styles.accountRow} key={reward.id}><Text style={styles.cardTitle}>{reward.name}</Text><Text style={styles.pill}>{reward.points_required} points</Text></View>)}
      {notice ? <Text style={styles.successText}>{notice}</Text> : null}{error ? <Text style={styles.formError}>{error}</Text> : null}
    </View>
  </>;
}
function Inventory({ branchId, isHeadAdmin }) {
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [inventoryId, setInventoryId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [stockMenuOpen, setStockMenuOpen] = useState(false);
  const [destinationMenuOpen, setDestinationMenuOpen] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    if (!supabase) {
      setItems(products.filter((item) => item.category === 'Inventory').map((item) => ({ id: String(item.id), name: item.name, sku: `INV-${item.id}`, quantity: item.stock, low_stock_threshold: 10, unit_cost: 0, branch_id: branchId || 'demo-lipa' })));
      setBranches([{ id: 'demo-lipa', name: 'Lipa Branch' }, { id: 'demo-manila', name: 'Manila Branch' }]);
      setTransfers([]); setMovements([]); setLoading(false); return;
    }
    try {
      const [stock, transferRows, movementRows, branchResult] = await Promise.all([
        requestApi(`/api/inventory${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
        requestApi('/api/inventory/transfers'),
        requestApi(`/api/inventory/movements${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
        supabase.from('branches').select('id,name').eq('is_active', true).order('name'),
      ]);
      setItems(stock); setInventoryId(stock[0]?.id || ''); setTransfers(transferRows); setMovements(movementRows);
      if (!branchResult.error) setBranches(branchResult.data);
    } catch (loadError) { setError(loadError.message || 'Unable to load inventory.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [branchId]);
  const requestTransfer = async () => {
    const item = items.find((stock) => stock.id === inventoryId);
    if (!item || !toBranchId || Number(quantity) < 1) return setError('Choose an item, destination branch, and quantity.');
    setSaving(true); setError(''); setNotice('');
    try {
      if (supabase) await requestApi('/api/inventory/transfers', { method: 'POST', body: JSON.stringify({ fromBranchId: item.branch_id, toBranchId, items: [{ inventoryId: item.id, quantity: Number(quantity) }] }) });
      else setTransfers((current) => [{ id: `demo-transfer-${Date.now()}`, from_branch_id: item.branch_id, to_branch_id: toBranchId, status: 'requested', inventory_transfer_items: [{ inventory_id: item.id, quantity: Number(quantity) }] }, ...current]);
      setNotice('Transfer request submitted for head-admin approval.');
      await reload();
    } catch (requestError) { setError(requestError.message || 'Unable to request transfer.'); }
    finally { setSaving(false); }
  };
  const reviewTransfer = async (transferId, status) => {
    setError(''); setNotice('');
    try {
      if (supabase) await requestApi(`/api/inventory/transfers/${transferId}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
      else setTransfers((current) => current.map((transfer) => transfer.id === transferId ? { ...transfer, status: status === 'approved' ? 'completed' : 'rejected' } : transfer));
      setNotice(`Transfer ${status}.`);
      await reload();
    } catch (reviewError) { setError(reviewError.message || 'Unable to review transfer.'); }
  };
  const adjustStock = async (item, delta) => {
    setError(''); setNotice('');
    try {
      if (supabase) await requestApi(`/api/inventory/${item.id}/adjust`, { method: 'POST', body: JSON.stringify({ delta }) });
      else setItems((current) => current.map((stock) => stock.id === item.id ? { ...stock, quantity: Math.max(0, stock.quantity + delta) } : stock));
      setNotice(`${item.name} stock ${delta > 0 ? 'received' : 'adjusted'}.`);
      if (supabase) await reload();
    } catch (adjustError) { setError(adjustError.message || 'Unable to adjust stock.'); }
  };
  const selectedItem = items.find((item) => item.id === inventoryId);
  return <>
    <Header eyebrow="Branch operations" title="Inventory" subtitle="Monitor branch stock, cost, and inter-branch movement." />
    {error ? <Text style={styles.formError}>{error}</Text> : null}{notice ? <Text style={styles.successText}>{notice}</Text> : null}
    <View style={styles.stats}><Stat label="Tracked items" value={String(items.length)} note="At selected branches" /><Stat label="Low stock" value={String(items.filter((item) => item.quantity <= item.low_stock_threshold).length)} note="At or below threshold" /><Stat label="Stock value" value={money(items.reduce((sum, item) => sum + Number(item.unit_cost || 0) * item.quantity, 0))} note="Based on recorded cost" /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Stock by branch</Text>{loading ? <Text style={styles.subtitle}>Loading inventory...</Text> : items.map((item) => <View style={styles.accountRow} key={item.id}><View style={styles.flex}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.subtitle}>{item.sku} · {item.branches?.name || branches.find((branch) => branch.id === item.branch_id)?.name || 'Branch stock'}</Text></View><Text style={item.quantity <= item.low_stock_threshold ? styles.warning : styles.price}>{item.quantity} units</Text><View style={styles.quantity}><Pressable onPress={() => adjustStock(item, -1)} style={styles.quantityButton}><Text>-</Text></Pressable><Pressable onPress={() => adjustStock(item, 1)} style={styles.quantityButton}><Text>+</Text></Pressable></View></View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Request stock transfer</Text>
      <Text style={styles.fieldLabel}>Stock item</Text>
      <View style={styles.roleDropdown}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: stockMenuOpen }} onPress={() => setStockMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
          <Text style={styles.roleDropdownValue}>{selectedItem ? `${selectedItem.name} · ${selectedItem.quantity} available` : 'Select inventory item'}</Text>
          <Text style={styles.roleDropdownChevron}>{stockMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {stockMenuOpen && <View style={styles.roleDropdownMenu}>{items.map((item) => <Pressable key={item.id} onPress={() => { setInventoryId(item.id); setStockMenuOpen(false); }} style={[styles.roleDropdownOption, inventoryId === item.id && styles.roleDropdownOptionSelected]}><Text style={[styles.roleDropdownOptionText, inventoryId === item.id && styles.roleDropdownOptionTextSelected]}>{item.name} · {item.quantity} available</Text></Pressable>)}</View>}
      </View>
      <Text style={styles.fieldLabel}>Destination branch</Text>
      <View style={styles.roleDropdown}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: destinationMenuOpen }} onPress={() => setDestinationMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
          <Text style={styles.roleDropdownValue}>{branches.find((branch) => branch.id === toBranchId)?.name || 'Select destination branch'}</Text>
          <Text style={styles.roleDropdownChevron}>{destinationMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {destinationMenuOpen && <View style={styles.roleDropdownMenu}>{branches.filter((branch) => branch.id !== selectedItem?.branch_id).map((branch) => <Pressable key={branch.id} onPress={() => { setToBranchId(branch.id); setDestinationMenuOpen(false); }} style={[styles.roleDropdownOption, toBranchId === branch.id && styles.roleDropdownOptionSelected]}><Text style={[styles.roleDropdownOptionText, toBranchId === branch.id && styles.roleDropdownOptionTextSelected]}>{branch.name}</Text></Pressable>)}</View>}
      </View>
      <TextInput value={quantity} onChangeText={setQuantity} placeholder="Quantity" keyboardType="number-pad" style={styles.authInput} />
      <Pressable disabled={saving} style={[styles.buttonDark, saving && styles.disabled]} onPress={requestTransfer}><Text style={styles.buttonText}>{saving ? 'Submitting...' : 'Request transfer'}</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Transfer requests</Text>{transfers.length ? transfers.map((transfer) => <View style={styles.accountRow} key={transfer.id}><View style={styles.flex}><Text style={styles.cardTitle}>{branches.find((branch) => branch.id === transfer.from_branch_id)?.name || 'Source'} → {branches.find((branch) => branch.id === transfer.to_branch_id)?.name || 'Destination'}</Text><Text style={styles.subtitle}>{transfer.status} · {transfer.inventory_transfer_items?.length || 0} item(s)</Text></View>{isHeadAdmin && transfer.status === 'requested' && <View style={styles.queueActions}><Pressable style={styles.smallButton} onPress={() => reviewTransfer(transfer.id, 'approved')}><Text style={styles.buttonText}>Approve</Text></Pressable><Pressable style={styles.deleteButton} onPress={() => reviewTransfer(transfer.id, 'rejected')}><Text style={styles.deleteButtonText}>Reject</Text></Pressable></View>}</View>) : <Text style={styles.subtitle}>No transfer requests.</Text>}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Recent stock movement</Text>{movements.length ? movements.slice(0, 30).map((movement) => <View style={styles.accountRow} key={movement.id}><View style={styles.flex}><Text style={styles.cardTitle}>{movement.inventory?.name || 'Stock item'} · {movement.movement_type.replaceAll('_', ' ')}</Text><Text style={styles.subtitle}>{movement.branches?.name || 'Branch'} · {new Date(movement.created_at).toLocaleString()}</Text></View><Text style={movement.quantity_delta > 0 ? styles.price : styles.warning}>{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</Text></View>) : <Text style={styles.subtitle}>Stock activity will appear here.</Text>}</View>
  </>;
}
function Products({ visibleProducts, search, setSearch, onAdd, cart = [], onChangeQuantity, onPlaceOrder }) {
  return <><Header eyebrow="Catalog management" title="Products" subtitle="Items available to customers and the POS." /><TextInput value={search} onChangeText={setSearch} placeholder="Search coffee, matcha, pastry, or SKU" style={styles.input} /><View style={styles.productGrid}>{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</View>{onChangeQuantity && <CartPanel cart={cart} onChangeQuantity={onChangeQuantity} onPlaceOrder={onPlaceOrder} />}</>;
}
function ProductCard({ product, onAdd, onDelete }) {
  return <View style={styles.productCard}>{product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" accessibilityLabel={`${product.name} product photo`} /> : <Text style={styles.productEmoji}>{product.emoji}</Text>}<Text style={styles.eyebrow}>{product.category}</Text><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.subtitle}>{product.description}</Text><View style={styles.cardFooter}><Text style={styles.price}>{money(product.price)}</Text>{onAdd && <Pressable style={styles.button} onPress={() => onAdd(product)}><Text style={styles.buttonText}>Add to order</Text></Pressable>}{onDelete && <Pressable style={styles.deleteButton} onPress={() => onDelete(product)}><Text style={styles.deleteButtonText}>Delete</Text></Pressable>}</View></View>;
}

function AdminProducts({ products, branches, defaultBranchId, isHeadAdmin, onCreateProduct, onDeleteProduct }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [branchId, setBranchId] = useState(isHeadAdmin ? '' : defaultBranchId || '');
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(false);

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
      if (!result.canceled) setPhoto(result.assets[0]);
    } catch (pickError) {
      setError(pickError.message || 'Unable to open the photo library.');
    }
  };

  const submit = async () => {
    const numericPrice = Number(price);
    if (!name.trim()) return setError('Enter a product name.');
    if (!category.trim()) return setError('Enter a product category.');
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return setError('Enter a valid product price.');
    if (!unitCost.trim()) return setError('Enter the product unit cost.');
    if (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0) return setError('Enter a valid product cost.');
    if (!initialStock.trim() || !Number.isInteger(Number(initialStock)) || Number(initialStock) < 0) return setError('Enter a valid initial stock quantity.');
    if (!description.trim()) return setError('Enter a short product description.');
    if (!photo) return setError('Upload a product photo.');
    setSaving(true);
    setError('');
    try {
      await onCreateProduct({ name: name.trim(), category: category.trim(), price: numericPrice, unitCost: Number(unitCost), initialStock: Number(initialStock), description: description.trim(), photo, branchId: isHeadAdmin ? branchId : defaultBranchId });
      setName('');
      setCategory('');
      setPrice('');
      setUnitCost('');
      setInitialStock('');
      setDescription('');
      setPhoto(null);
    } catch (saveError) {
      setError(saveError.message || 'Unable to add this product.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (product) => setProductToDelete(product);
  const deleteSelectedProduct = async () => {
    setDeletingProduct(true);
    setError('');
    try {
      await onDeleteProduct(productToDelete);
      setProductToDelete(null);
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete this product.');
    } finally {
      setDeletingProduct(false);
    }
  };

  return <>
    <Header eyebrow="Catalog management" title="Products" subtitle="Add items to the customer and POS catalog." />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add a product</Text>
      <Pressable style={styles.photoPicker} onPress={choosePhoto} accessibilityRole="button">
        {photo ? <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" /> : <Text style={styles.photoPickerText}>＋  Upload product photo</Text>}
      </Pressable>
      <TextInput value={name} onChangeText={setName} placeholder="Product name *" style={styles.authInput} />
      <TextInput value={category} onChangeText={setCategory} placeholder="Category *" style={styles.authInput} />
      <TextInput value={price} onChangeText={setPrice} placeholder="Price *" keyboardType="decimal-pad" style={styles.authInput} />
      <TextInput value={unitCost} onChangeText={setUnitCost} placeholder="Unit cost *" keyboardType="decimal-pad" style={styles.authInput} />
      <TextInput value={initialStock} onChangeText={setInitialStock} placeholder="Initial stock per branch *" keyboardType="number-pad" style={styles.authInput} />
      <TextInput value={description} onChangeText={setDescription} placeholder="Short product description *" multiline style={[styles.authInput, styles.addressInput]} />
      {isHeadAdmin ? <>
        <Text style={styles.fieldLabel}>Product scope</Text>
        <View style={styles.roleDropdown}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: scopeMenuOpen }} onPress={() => setScopeMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
            <Text style={styles.roleDropdownValue}>{branches.find((branch) => branch.id === branchId)?.name || 'All branches (global)'}</Text><Text style={styles.roleDropdownChevron}>{scopeMenuOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {scopeMenuOpen && <View style={styles.roleDropdownMenu}>
            {[{ id: '', name: 'All branches (global)' }, ...branches].map((branch) => <Pressable key={branch.id || 'global'} onPress={() => { setBranchId(branch.id); setScopeMenuOpen(false); }} style={styles.roleDropdownOption}><Text style={styles.roleDropdownOptionText}>{branch.name}</Text></Pressable>)}
          </View>}
        </View>
      </> : <Text style={styles.subtitle}>Branch: {branches.find((branch) => branch.id === defaultBranchId)?.name || 'Assigned branch'}</Text>}
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Pressable disabled={saving} style={[styles.buttonDark, saving && styles.disabled]} onPress={submit}>
        <Text style={styles.buttonText}>{saving ? 'Adding product...' : 'Add product'}</Text>
      </Pressable>
    </View>
    {error ? <Text style={styles.formError}>{error}</Text> : null}
    {productToDelete && <DeleteConfirmation itemName={productToDelete.name} saving={deletingProduct} onCancel={() => setProductToDelete(null)} onConfirm={deleteSelectedProduct} />}
    <View style={styles.productGrid}>{products.filter((product) => product.category !== 'Inventory').map((product) => <ProductCard key={product.id} product={product} onDelete={confirmDelete} />)}</View>
  </>;
}

function Promotions({ promotions, products, branches, defaultBranchId, isHeadAdmin, onCreatePromotion, onDeletePromotion }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [productId, setProductId] = useState('');
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [promoType, setPromoType] = useState('buy_x_get_y');
  const [buyQuantity, setBuyQuantity] = useState('3');
  const [getQuantity, setGetQuantity] = useState('1');
  const [discountValue, setDiscountValue] = useState('');
  const [branchId, setBranchId] = useState(isHeadAdmin ? '' : defaultBranchId || '');
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [promotionToDelete, setPromotionToDelete] = useState(null);
  const [deletingPromotion, setDeletingPromotion] = useState(false);

  const submit = async () => {
    if (!title.trim()) return setError('Enter a promo title.');
    if (!description.trim()) return setError('Enter promo details.');
    if (promoType === 'buy_x_get_y' && (Number(buyQuantity) < 1 || Number(getQuantity) < 1)) return setError('Enter valid Buy X Get Y quantities.');
    if (promoType !== 'buy_x_get_y' && Number(discountValue) <= 0) return setError('Enter a valid discount amount.');
    if (promoType === 'percentage' && Number(discountValue) > 100) return setError('Percentage discounts cannot exceed 100.');
    setSaving(true);
    setError('');
    try {
      await onCreatePromotion({ title: title.trim(), description: description.trim(), productId, promoType, buyQuantity: Number(buyQuantity), getQuantity: Number(getQuantity), discountValue: Number(discountValue) || 0, branchId: isHeadAdmin ? branchId : defaultBranchId });
      setTitle('');
      setDescription('');
      setProductId('');
    } catch (saveError) {
      setError(saveError.message || 'Unable to create this promo.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (promotion) => setPromotionToDelete(promotion);
  const deleteSelectedPromotion = async () => {
    setDeletingPromotion(true);
    setError('');
    try {
      await onDeletePromotion(promotionToDelete);
      setPromotionToDelete(null);
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete this promo.');
    } finally {
      setDeletingPromotion(false);
    }
  };

  const selectedProduct = products.find((product) => product.id === productId);
  return <>
    <Header eyebrow="Customer offers" title="Promotions" subtitle="Create promo cards shown on the customer home screen." />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add a promo</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Promo title *" style={styles.authInput} />
      <TextInput value={description} onChangeText={setDescription} placeholder="Short promo details *" multiline style={[styles.authInput, styles.addressInput]} />
      <Text style={styles.fieldLabel}>Promotion type</Text>
      <View style={styles.roleDropdown}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: typeMenuOpen }} onPress={() => setTypeMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
          <Text style={styles.roleDropdownValue}>{promoType === 'buy_x_get_y' ? 'Buy X Get Y' : promoType === 'percentage' ? 'Percentage discount' : promoType === 'fixed' ? 'Fixed amount discount' : 'Bundle discount'}</Text><Text style={styles.roleDropdownChevron}>{typeMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {typeMenuOpen && <View style={styles.roleDropdownMenu}>{[
          ['buy_x_get_y', 'Buy X Get Y'], ['percentage', 'Percentage discount'], ['fixed', 'Fixed amount discount'], ['bundle', 'Bundle discount'],
        ].map(([value, label]) => <Pressable key={value} onPress={() => { setPromoType(value); setTypeMenuOpen(false); }} style={styles.roleDropdownOption}><Text style={styles.roleDropdownOptionText}>{label}</Text></Pressable>)}</View>}
      </View>
      {promoType === 'buy_x_get_y' ? <View style={styles.fieldRow}>
        <TextInput value={buyQuantity} onChangeText={setBuyQuantity} placeholder="Buy quantity" keyboardType="number-pad" style={[styles.authInput, styles.fieldHalf]} />
        <TextInput value={getQuantity} onChangeText={setGetQuantity} placeholder="Free quantity" keyboardType="number-pad" style={[styles.authInput, styles.fieldHalf]} />
      </View> : <TextInput value={discountValue} onChangeText={setDiscountValue} placeholder={promoType === 'percentage' ? "Discount percent *" : "Discount amount *"} keyboardType="decimal-pad" style={styles.authInput} />}
      <Text style={styles.fieldLabel}>Featured product (optional)</Text>
      <View style={styles.roleDropdown}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: productMenuOpen }} onPress={() => setProductMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
          <Text style={styles.roleDropdownValue}>{selectedProduct?.name || 'No featured product'}</Text>
          <Text style={styles.roleDropdownChevron}>{productMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {productMenuOpen && <View style={styles.roleDropdownMenu}>
          {[{ id: '', name: 'No featured product' }, ...products].map((product) => (
            <Pressable key={product.id || 'none'} onPress={() => { setProductId(product.id); setProductMenuOpen(false); }} style={[styles.roleDropdownOption, productId === product.id && styles.roleDropdownOptionSelected]}>
              <Text style={[styles.roleDropdownOptionText, productId === product.id && styles.roleDropdownOptionTextSelected]}>{product.name}</Text>
            </Pressable>
          ))}
        </View>}
      </View>
      {isHeadAdmin ? <>
        <Text style={styles.fieldLabel}>Promotion scope</Text>
        <View style={styles.roleDropdown}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: scopeMenuOpen }} onPress={() => setScopeMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
            <Text style={styles.roleDropdownValue}>{branches.find((branch) => branch.id === branchId)?.name || 'All branches (global)'}</Text><Text style={styles.roleDropdownChevron}>{scopeMenuOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {scopeMenuOpen && <View style={styles.roleDropdownMenu}>{[{ id: '', name: 'All branches (global)' }, ...branches].map((branch) => <Pressable key={branch.id || 'global'} onPress={() => { setBranchId(branch.id); setScopeMenuOpen(false); }} style={styles.roleDropdownOption}><Text style={styles.roleDropdownOptionText}>{branch.name}</Text></Pressable>)}</View>}
        </View>
      </> : <Text style={styles.subtitle}>Branch: {branches.find((branch) => branch.id === defaultBranchId)?.name || 'Assigned branch'}</Text>}
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Pressable disabled={saving} style={[styles.buttonDark, saving && styles.disabled]} onPress={submit}>
        <Text style={styles.buttonText}>{saving ? 'Adding promo...' : 'Add promo'}</Text>
      </Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Current promos</Text>
      {promotionToDelete && <DeleteConfirmation itemName={promotionToDelete.title} saving={deletingPromotion} onCancel={() => setPromotionToDelete(null)} onConfirm={deleteSelectedPromotion} />}
      {promotions.length ? promotions.map((promotion) => (
        <View style={styles.accountRow} key={promotion.id}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{promotion.title}</Text>
            <Text style={styles.subtitle}>{promotion.description}</Text>
            <Text style={styles.subtitle}>{promotion.promoType || 'buy_x_get_y'} · {promotion.branchIds?.length ? 'Selected branches' : 'All branches'}</Text>
            {promotion.productId ? <Text style={styles.subtitle}>Featured: {products.find((product) => product.id === promotion.productId)?.name || 'Product removed'}</Text> : null}
          </View>
          <Pressable style={styles.deleteButton} onPress={() => confirmDelete(promotion)}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>
      )) : <Text style={styles.subtitle}>No promos yet.</Text>}
    </View>
  </>;
}
function DeleteConfirmation({ itemName, saving, onCancel, onConfirm }) {
  return <View style={styles.deleteConfirmation}>
    <Text style={styles.cardTitle}>Delete {itemName}?</Text>
    <Text style={styles.subtitle}>This action cannot be undone.</Text>
    <View style={styles.confirmActions}>
      <Pressable disabled={saving} style={styles.confirmCancelButton} onPress={onCancel}>
        <Text style={styles.confirmCancelText}>Cancel</Text>
      </Pressable>
      <Pressable disabled={saving} style={[styles.confirmDeleteButton, saving && styles.disabled]} onPress={onConfirm}>
        <Text style={styles.confirmDeleteText}>{saving ? 'Deleting...' : 'Delete'}</Text>
      </Pressable>
    </View>
  </View>;
}
function previewPromotion(cart, promotions, branchId) {
  const now = Date.now();
  const matchesProduct = (promotion, item) => promotion.eligibleProductIds?.length
    ? promotion.eligibleProductIds.includes(item.id)
    : !promotion.productId || promotion.productId === item.id;
  const promotion = promotions.find((item) => item.is_active !== false
    && (!item.branchIds?.length || !branchId || item.branchIds.includes(branchId))
    && (!item.starts_at || new Date(item.starts_at).getTime() <= now)
    && (!item.ends_at || new Date(item.ends_at).getTime() > now)
    && cart.some((product) => matchesProduct(item, product)));
  const items = cart.map((item) => ({ ...item }));
  if (!promotion || !items.length) return { items, discountTotal: 0, promotion: null };
  const eligibleItems = items.filter((item) => matchesProduct(promotion, item));
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!eligibleItems.length) return { items, discountTotal: 0, promotion: null };
  let discountTotal = 0;
  if (promotion.promoType === 'buy_x_get_y') {
    const quantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
    const freeQuantity = Math.floor(quantity / promotion.buyQuantity) * promotion.getQuantity;
    const freeItem = items.find((item) => item.id === promotion.freeProductId)
      || eligibleItems[0];
    if (freeQuantity > 0 && freeItem) items.push({ ...freeItem, id: `promo-${promotion.id}`, name: `${freeItem.name} (Promo)`, price: 0, quantity: freeQuantity, isPromo: true, promoLabel: `Free via ${promotion.title}` });
  } else if (promotion.promoType === 'percentage') {
    discountTotal = Math.round(eligibleSubtotal * Math.min(promotion.discountValue, 100)) / 100;
  } else if (promotion.promoType === 'fixed' || promotion.promoType === 'bundle') {
    discountTotal = Math.min(eligibleSubtotal, promotion.discountValue);
  }
  return { items, discountTotal, promotion };
}

function Pos({ visibleProducts, promotions, branchId, checkoutNotice, search, setSearch, cart, onAdd, onPlaceOrder, onChangeQuantity }) {
  const [customerCode, setCustomerCode] = useState('');
  const [customerInfo, setCustomerInfo] = useState(null);
  const [customerLookupError, setCustomerLookupError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const preview = previewPromotion(cart, promotions, branchId);
  const lookupCustomer = async (code = customerCode) => {
    if (!code.trim()) { setCustomerInfo(null); setCustomerLookupError(''); return; }
    try {
      const info = supabase
        ? await requestApi(`/api/pos/customers/${encodeURIComponent(code.trim())}`)
        : (() => {
          const demo = demoAccounts.find((account) => account.customerCode === code.trim());
          return demo ? { full_name: demo.name, customer_code: demo.customerCode, reward_points: 0 } : null;
        })();
      if (!info) throw new Error('Customer ID not found.');
      setCustomerInfo(info); setCustomerLookupError('');
    } catch (lookupError) { setCustomerInfo(null); setCustomerLookupError(lookupError.message || 'Customer ID not found.'); }
  };
  const openScanner = async () => {
    setScanError('');
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return setScanError('Camera access is needed to scan customer QR codes.');
    }
    setScanOpen(true);
  };
  return <>
    <Header eyebrow="Service choreography" title="Point of sale" subtitle="Promotions apply automatically at checkout." />
    <TextInput value={search} onChangeText={setSearch} placeholder="Search menu" style={styles.input} />
    <View style={styles.productGrid}>{visibleProducts.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</View>
    <CartPanel cart={preview.items} discountTotal={preview.discountTotal} promotionLabel={preview.promotion?.title} onChangeQuantity={onChangeQuantity} onPlaceOrder={() => onPlaceOrder(customerCode.trim())} onScanCustomer={openScanner} onCustomerLookup={() => lookupCustomer()} customerInfo={customerInfo} customerLookupError={customerLookupError} buttonLabel="Charge" customerCode={customerCode} setCustomerCode={setCustomerCode} />
    {checkoutNotice ? <Text style={styles.successText}>{checkoutNotice}</Text> : null}
    {scanError ? <Text style={styles.formError}>{scanError}</Text> : null}
    <Modal visible={scanOpen} transparent animationType="slide" onRequestClose={() => setScanOpen(false)}>
      <View style={styles.scannerBackdrop}><View style={styles.scannerSheet}>
        <Text style={styles.cardTitle}>Scan customer QR</Text>
        <CameraView style={styles.scanCamera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { const code = data.trim(); setCustomerCode(code); setScanOpen(false); lookupCustomer(code); }} />
        <Pressable style={styles.buttonSecondary} onPress={() => setScanOpen(false)}><Text>Cancel</Text></Pressable>
      </View></View>
    </Modal>
  </>;
}
function CartPanel({ cart, onChangeQuantity, onPlaceOrder, buttonLabel = 'Place pickup order', discountTotal = 0, promotionLabel, customerCode, setCustomerCode, onScanCustomer, onCustomerLookup, customerInfo, customerLookupError }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal);
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</Text>
    {setCustomerCode && <View style={styles.customerIdRow}><TextInput value={customerCode} onChangeText={setCustomerCode} onBlur={onCustomerLookup} placeholder="Customer ID (optional)" autoCapitalize="characters" style={[styles.input, styles.customerIdInput]} />{onScanCustomer && <Pressable style={styles.smallButton} onPress={onScanCustomer}><Text style={styles.buttonText}>Scan QR</Text></Pressable>}</View>}
    {customerInfo && <Text style={styles.successText}>{customerInfo.full_name} · {customerInfo.reward_points} points</Text>}
    {customerLookupError ? <Text style={styles.formError}>{customerLookupError}</Text> : null}
    {cart.length ? cart.map((item) => <View style={styles.cartRow} key={item.id}>
      <View style={styles.flex}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.subtitle}>{item.promoLabel || `${money(item.price)} each`}</Text></View>
      {!item.isPromo && <View style={styles.quantity}><Pressable onPress={() => onChangeQuantity(item.id, -1)} style={styles.quantityButton}><Text>-</Text></Pressable><Text>{item.quantity}</Text><Pressable onPress={() => onChangeQuantity(item.id, 1)} style={styles.quantityButton}><Text>+</Text></Pressable></View>}
      <Text style={styles.price}>{money(item.price * item.quantity)}</Text>
    </View>) : <Text style={styles.subtitle}>Your cart is empty. Tap Add to order to get started.</Text>}
    {promotionLabel ? <Text style={styles.successText}>Promotion applied: {promotionLabel}</Text> : null}
    {discountTotal > 0 && <Text style={styles.promoPrice}>Discount: -{money(discountTotal)}</Text>}
    <Text style={styles.total}>Total: {money(total)}</Text>
    <Pressable disabled={!cart.length} style={[styles.buttonDark, !cart.length && styles.disabled]} onPress={onPlaceOrder}><Text style={styles.buttonText}>{buttonLabel} {money(total)}</Text></Pressable>
  </View>;
}
function Queue({ orders, onUpdateStatus }) {
  return <><Header eyebrow="Service choreography" title="Order queue" subtitle="Move orders through preparation." />{orders.map((order) => <View style={styles.listCard} key={order.id}><View style={styles.flex}><Text style={styles.cardTitle}>#{order.id} · {order.customer}</Text><Text style={styles.subtitle}>{order.items} · {order.channel}</Text></View><View style={styles.queueActions}><Text style={styles.pill}>{order.status}</Text>{order.status !== 'Ready for pickup' && <Pressable style={styles.smallButton} onPress={() => onUpdateStatus(order.id, 'Ready for pickup')}><Text style={styles.buttonText}>Mark ready</Text></Pressable>}</View></View>)}</>;
}
function Receipts({ orders }) {
  return <><Header eyebrow="Service history" title="Receipts" subtitle="Recent counter and online orders." />{orders.map((order) => <View style={styles.listCard} key={order.id}><View style={styles.flex}><Text style={styles.cardTitle}>#{order.id}</Text><Text style={styles.subtitle}>{order.customer} · {order.items}</Text>{order.promotionTitle && <Text style={styles.successText}>Promotion: {order.promotionTitle}</Text>}{Number(order.discount_total || order.discountTotal || 0) > 0 && <Text style={styles.warning}>Discount: -{money(order.discount_total || order.discountTotal)}</Text>}</View><Text style={styles.price}>{money(order.total)}</Text></View>)}</>;
}
function Reports({ summary, branches, selectedBranchId, onSelectBranch, isHeadAdmin }) {
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  return <>
    <Header eyebrow="Performance analytics" title="Sales reports" subtitle="Sales, inventory valuation, costing, and customer activity." />
    {isHeadAdmin && <View style={styles.card}>
      <Text style={styles.fieldLabel}>Reporting scope</Text>
      <View style={styles.roleDropdown}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: branchMenuOpen }} onPress={() => setBranchMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
          <Text style={styles.roleDropdownValue}>{selectedBranch?.name || 'All branches combined'}</Text><Text style={styles.roleDropdownChevron}>{branchMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {branchMenuOpen && <View style={styles.roleDropdownMenu}>
          {[{ id: '', name: 'All branches combined' }, ...branches].map((branch) => <Pressable key={branch.id || 'all'} onPress={() => { onSelectBranch(branch.id); setBranchMenuOpen(false); }} style={styles.roleDropdownOption}><Text style={styles.roleDropdownOptionText}>{branch.name}</Text></Pressable>)}
        </View>}
      </View>
    </View>}
    <View style={styles.stats}>
      <Stat label="Gross sales" value={money(summary?.sales || 0)} note={`${summary?.orders || 0} orders`} />
      <Stat label="Average order" value={money(summary?.averageOrder || 0)} note="Per completed sale" />
      <Stat label="Customers" value={String(summary?.customers || 0)} note="Unique customers" />
      <Stat label="Low stock" value={String(summary?.lowStock || 0)} note="Threshold alerts" />
      <Stat label="Inventory value" value={money(summary?.inventoryValue || 0)} note="At recorded unit cost" />
      <Stat label="Cost of goods" value={money(summary?.costOfGoods || 0)} note="Based on product cost" />
      <Stat label="Gross profit" value={money(summary?.grossProfit || 0)} note="Sales less cost of goods" />
    </View>
  </>;
}
function CustomerHome({ products, promotions, branchId, branches, checkoutNotice, user, orders, onNavigate, onAdd, cart, onChangeQuantity, onPlaceOrder }) {
  const customerOrders = orders.filter((order) => order.customerEmail === user.email);
  const readyOrder = customerOrders.find((order) => order.status === 'Ready for pickup');
  const currentTime = Date.now();
  const activePromotion = promotions.find((promotion) => promotion.is_active !== false
    && (!promotion.branchIds?.length || promotion.branchIds.includes(branchId))
    && (!promotion.starts_at || new Date(promotion.starts_at).getTime() <= currentTime)
    && (!promotion.ends_at || new Date(promotion.ends_at).getTime() > currentTime));
  const promotedProduct = activePromotion && products.find((product) => product.id === activePromotion.productId);
  const customerProducts = products.filter((product) => product.category !== 'Inventory');
  const branchName = branches.find((branch) => branch.id === branchId)?.name || 'Lipa Branch';
  return <>
    <Header eyebrow={`360 Degrees Specialty Cafe · ${branchName}`} title={`Good morning, ${user.name}.`} subtitle="Your neighborhood coffee, ready when you are." />
    {user.customerCode && <View style={styles.customerIdCard}><QRCode value={user.customerCode} size={108} /><View style={styles.flex}><Text style={styles.eyebrow}>Customer ID</Text><Text style={styles.customerId}>{user.customerCode}</Text><Text style={styles.subtitle}>Show this code at checkout to earn points.</Text></View></View>}
    {readyOrder && <View style={styles.notification}><Text style={styles.notificationTitle}>Your order is ready for pickup</Text><Text style={styles.subtitle}>Order #{readyOrder.id} is ready at Lipa Branch.</Text></View>}
    {activePromotion ? <View style={styles.promo}>
      <Text style={styles.eyebrow}>Featured promotion</Text>
      <Text style={styles.promoTitle}>{activePromotion.title}</Text>
      <Text style={styles.subtitle}>{activePromotion.description}</Text>
      {promotedProduct && <Text style={styles.promoPrice}>{promotedProduct.name} · {money(promotedProduct.price)}</Text>}
      <Pressable style={styles.button} onPress={() => promotedProduct ? onAdd(promotedProduct) : onNavigate('menu')}>
        <Text style={styles.buttonText}>{promotedProduct ? `Order ${promotedProduct.name}` : 'See menu'}</Text>
      </Pressable>
    </View> : <View style={styles.promo}>
      <Text style={styles.eyebrow}>October special · from {money(215)}</Text>
      <Text style={styles.promoTitle}>Ube cloud, made for slow afternoons.</Text>
      <Text style={styles.subtitle}>Velvety ube, local espresso, and a sea-salt cream cap.</Text>
      <Pressable style={styles.button} onPress={() => onAdd(products.find((product) => product.name === 'Ube Cloud Latte') || customerProducts[0])}>
        <Text style={styles.buttonText}>Order Ube Cloud Latte</Text>
      </Pressable>
    </View>}
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Picked for you</Text>
      {customerProducts.slice(0, 3).map((product) => <Pressable style={styles.listRow} key={product.id} onPress={() => onAdd(product)}><Text>{product.emoji} {product.name}</Text><Text style={styles.price}>{money(product.price)}</Text></Pressable>)}
      <Pressable style={styles.buttonSecondary} onPress={() => onNavigate('menu')}><Text>See menu</Text></Pressable>
    </View>
    <CartPanel cart={cart} onChangeQuantity={onChangeQuantity} onPlaceOrder={onPlaceOrder} />
    {checkoutNotice ? <Text style={styles.successText}>{checkoutNotice}</Text> : null}
  </>;
}
function Orders({ orders, user }) {
  return <><Header eyebrow="Customer workspace" title="My orders" subtitle="Track your current pickup orders." />{orders.filter((order) => order.customerEmail === user.email).map((order) => <View style={styles.listCard} key={order.id}><View style={styles.flex}><Text style={styles.cardTitle}>#{order.id}</Text><Text style={styles.subtitle}>{order.items}</Text></View><Text style={styles.pill}>{order.status}</Text></View>)}</>;
}
function Wallet({ user, onRedeem }) {
  const [points, setPoints] = useState(user.rewardPoints || 0);
  const [history, setHistory] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [redeemingId, setRedeemingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase || !user.id) return;
    let active = true;
    Promise.all([
      supabase.from('profiles').select('reward_points,customer_code').eq('id', user.id).single(),
      supabase.from('reward_transactions').select('points,description,transaction_type,created_at,expires_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('rewards').select('id,name,description,points_required').eq('is_active', true).order('points_required'),
    ]).then(([profileResult, historyResult, rewardsResult]) => {
      if (!active) return;
      if (!profileResult.error) setPoints(profileResult.data.reward_points);
      if (!historyResult.error) {
        setHistory(historyResult.data);
        const availablePoints = historyResult.data.reduce((total, transaction) => {
          const expiredEarn = transaction.transaction_type === 'earned' && transaction.expires_at && new Date(transaction.expires_at).getTime() <= Date.now();
          if (expiredEarn || transaction.transaction_type === 'expired') return total;
          return total + Number(transaction.points);
        }, 0);
        setPoints(Math.max(0, availablePoints));
      }
      if (!rewardsResult.error) setRewards(rewardsResult.data);
    }).catch((error) => console.error('Loyalty lookup failure:', error.message));
    return () => { active = false; };
  }, [user.id]);
  const redeem = async (reward) => {
    setRedeemingId(reward.id); setError(''); setMessage('');
    try {
      const result = await onRedeem(reward.id);
      setPoints(result.pointsBalance);
      setHistory((current) => [{ points: -reward.points_required, description: `Redeemed: ${reward.name}`, transaction_type: 'redeemed', created_at: new Date().toISOString() }, ...current]);
      setMessage(`${reward.name} redeemed.`);
    } catch (redeemError) { setError(redeemError.message || 'Unable to redeem reward.'); }
    finally { setRedeemingId(''); }
  };
  const pointsUntilReward = rewards.length ? Math.max(0, rewards.find((reward) => reward.points_required > points)?.points_required - points || 0) : 0;
  return <>
    <Header eyebrow="360 rewards" title="Wallet & rewards" subtitle="Your points and reward history." />
    {user.customerCode && <View style={styles.customerIdCard}><QRCode value={user.customerCode} size={96} /><View style={styles.flex}><Text style={styles.eyebrow}>Customer ID</Text><Text style={styles.customerId}>{user.customerCode}</Text></View></View>}
    <View style={styles.reward}><Text style={styles.eyebrow}>360 REWARDS</Text><Text style={styles.rewardPoints}>{points} points</Text><Text style={styles.subtitle}>{pointsUntilReward ? `${pointsUntilReward} points to your next reward` : 'Choose a reward below'}</Text><View style={styles.progress}><View style={styles.progressFill} /></View></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Rewards</Text>{rewards.length ? rewards.map((reward) => <View style={styles.listCard} key={reward.id}><View style={styles.flex}><Text style={styles.cardTitle}>{reward.name}</Text><Text style={styles.subtitle}>{reward.description}</Text></View><View><Text style={styles.pill}>{reward.points_required} points</Text><Pressable disabled={points < reward.points_required || redeemingId === reward.id} style={[styles.smallButton, (points < reward.points_required || redeemingId === reward.id) && styles.disabled]} onPress={() => redeem(reward)}><Text style={styles.buttonText}>{redeemingId === reward.id ? 'Redeeming...' : 'Redeem'}</Text></Pressable></View></View>) : <Text style={styles.subtitle}>Rewards will appear here when available.</Text>}{message ? <Text style={styles.successText}>{message}</Text> : null}{error ? <Text style={styles.formError}>{error}</Text> : null}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Points history</Text>{history.length ? history.map((transaction) => <View style={styles.accountRow} key={`${transaction.created_at}-${transaction.description}`}><View style={styles.flex}><Text style={styles.cardTitle}>{transaction.description}</Text><Text style={styles.subtitle}>{new Date(transaction.created_at).toLocaleDateString()}</Text></View><Text style={styles.price}>{transaction.points > 0 ? '+' : ''}{transaction.points}</Text></View>) : <Text style={styles.subtitle}>Your points activity will appear here.</Text>}</View>
  </>;
}

function ManageAccount({ user, onSaveProfile, onChangePassword }) {
  const [name, setName] = useState(user.name || '');
  const [contactNumber, setContactNumber] = useState(user.contactNumber || '');
  const [address, setAddress] = useState(user.address || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveProfile = async () => {
    if (name.trim().length < 2) return setProfileError('Enter your full name.');
    if (!contactNumber.trim()) return setProfileError('Enter a contact number.');
    setSavingProfile(true);
    setProfileError('');
    try {
      await onSaveProfile({ fullName: name.trim(), contactNumber: contactNumber.trim(), address: address.trim() });
      Alert.alert('Account updated', 'Your account details have been saved.');
    } catch (saveError) {
      setProfileError(saveError.message || 'Unable to save account details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (newPassword.length < 8) return setPasswordError('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setPasswordError('Passwords do not match.');
    setSavingPassword(true);
    setPasswordError('');
    try {
      await onChangePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password changed', 'Your password has been updated.');
    } catch (saveError) {
      setPasswordError(saveError.message || 'Unable to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return <>
    <Header eyebrow="Customer workspace" title="Manage account" subtitle="Update your profile and sign-in password." />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Profile details</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Full name *" autoCapitalize="words" style={styles.authInput} />
      <TextInput value={user.email} editable={false} style={[styles.authInput, styles.readOnlyInput]} />
      <TextInput value={contactNumber} onChangeText={setContactNumber} placeholder="Contact number *" keyboardType="phone-pad" style={styles.authInput} />
      <TextInput value={address} onChangeText={setAddress} placeholder="Address" multiline style={[styles.authInput, styles.addressInput]} />
      {profileError ? <Text style={styles.formError}>{profileError}</Text> : null}
      <Pressable disabled={savingProfile} style={[styles.buttonDark, savingProfile && styles.disabled]} onPress={saveProfile}>
        <Text style={styles.buttonText}>{savingProfile ? 'Saving...' : 'Save profile'}</Text>
      </Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Change password</Text>
      <PasswordInput value={newPassword} onChangeText={setNewPassword} placeholder="New password (8+ characters)" visible={showNewPassword} onToggle={() => setShowNewPassword((visible) => !visible)} />
      <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} />
      {passwordError ? <Text style={styles.formError}>{passwordError}</Text> : null}
      <Pressable disabled={savingPassword} style={[styles.buttonDark, savingPassword && styles.disabled]} onPress={savePassword}>
        <Text style={styles.buttonText}>{savingPassword ? 'Saving...' : 'Update password'}</Text>
      </Pressable>
    </View>
  </>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fbf8f3' },
  authSafeArea: { flex: 1, backgroundColor: '#33241e' },
  authPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  authCard: { width: '100%', maxWidth: 460, backgroundColor: '#fffefa', borderRadius: 18, padding: 28 },
  authBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  authTabs: { flexDirection: 'row', backgroundColor: '#f3eee8', borderRadius: 9, padding: 4, marginBottom: 24 },
  authTab: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 7 },
  authTabActive: { backgroundColor: '#d9683c' },
  authTabText: { color: '#82766e', fontSize: 13, fontWeight: '700' },
  authTabTextActive: { color: '#fff' },
  brandNameDark: { color: '#30251f', fontFamily: 'Georgia', fontSize: 16, maxWidth: 180 },
  branchDark: { color: '#82766e', fontSize: 9, letterSpacing: 2, marginTop: 4 },
  authTitle: { color: '#30251f', fontFamily: 'Georgia', fontSize: 30, marginTop: 7, marginBottom: 8 },
  authSubtitle: { color: '#82766e', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  authInput: { minHeight: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 9, paddingHorizontal: 14, marginBottom: 12, fontSize: 14 },
  loyaltyInputWrapper: { position: 'relative', marginBottom: 12 },
  loyaltyRuleInput: { minHeight: 62, marginBottom: 0, paddingTop: 8, paddingBottom: 23, textAlignVertical: 'top' },
  loyaltyInputDescription: { position: 'absolute', left: 14, right: 14, bottom: 7, color: '#82766e', fontSize: 11 },
  readOnlyInput: { color: '#82766e', backgroundColor: '#f3eee8' },
  fieldLabel: { color: '#5e5149', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  roleDropdown: { marginBottom: 12 },
  roleDropdownTrigger: { minHeight: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 9, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roleDropdownValue: { color: '#30251f', fontSize: 14 },
  roleDropdownChevron: { color: '#82766e', fontSize: 11 },
  roleDropdownMenu: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 9, marginTop: 5, overflow: 'hidden' },
  roleDropdownOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  roleDropdownOptionSelected: { backgroundColor: '#f5ece6' },
  roleDropdownOptionText: { color: '#30251f', fontSize: 14 },
  roleDropdownOptionTextSelected: { color: '#b94f2b', fontWeight: '700' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldHalf: { flex: 1 },
  passwordInputWrapper: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 9, marginBottom: 12 },
  passwordInput: { flex: 1, minHeight: 46, paddingHorizontal: 14, fontSize: 14 },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 13 },
  passwordToggleText: { color: '#b94f2b', fontSize: 12, fontWeight: '700' },
  authButton: { backgroundColor: '#d9683c', padding: 14, borderRadius: 9, alignItems: 'center', marginTop: 6 },
  authSwitch: { alignItems: 'center', padding: 14 },
  authSwitchText: { color: '#b94f2b', fontSize: 13, fontWeight: '700' },
  formError: { color: '#b33c2f', fontSize: 12, marginBottom: 8 },
  successText: { color: '#596849', fontSize: 12, marginTop: 8 },
  auditDetails: { color: '#82766e', fontSize: 10, marginTop: 4 },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', paddingVertical: 12 },
  branchRowActive: { backgroundColor: '#f5ece6' },
  demoHint: { color: '#82766e', fontSize: 11, textAlign: 'center', marginTop: 10 },
  app: { flex: 1, flexDirection: 'row', position: 'relative' },
  appMobile: { flexDirection: 'column' },
  sidebar: { width: 246, backgroundColor: '#33241e', padding: 20, minHeight: '100%' },
  drawerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 8, backgroundColor: 'rgba(20, 13, 10, 0.58)' },
  drawerBackdropPressable: { flex: 1 },
  sidebarMobile: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 10, minHeight: 0, padding: 18, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 8, height: 0 }, elevation: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 },
  brandDetails: { flex: 1 },
  brandMark: { backgroundColor: '#d9683c', color: '#fff', borderRadius: 12, padding: 9, fontSize: 18, fontWeight: '700' },
  brandName: { color: '#fff', fontFamily: 'Georgia', fontSize: 16, maxWidth: 155 },
  branch: { color: '#b9a99f', fontSize: 9, letterSpacing: 2, marginTop: 4 },
  label: { color: '#9f8c80', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 9, marginTop: 8 },
  nav: { gap: 4 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 9 },
  navButtonActive: { backgroundColor: '#d9683c' },
  navIcon: { color: '#fff', width: 18, textAlign: 'center' },
  navText: { color: '#d8ccc3', fontSize: 13 },
  navTextActive: { color: '#fff', fontWeight: '700' },
  sidebarFooter: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#504038', paddingTop: 16 },
  store: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sidebarMuted: { color: '#b9a99f', fontSize: 10, marginTop: 4 },
  person: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 17 },
  signOut: { marginTop: 16, alignSelf: 'flex-start', paddingVertical: 6 },
  signOutText: { color: '#e8c4a7', fontSize: 11, fontWeight: '700' },
  main: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 70, padding: 16, borderBottomWidth: 1, borderBottomColor: '#e9e0d7', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  topbarMobile: { alignItems: 'flex-start', flexWrap: 'wrap' },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileHeader: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#33241e', flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#402e26' },
  menuIcon: { color: '#fff', fontSize: 23, lineHeight: 25 },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mobileBrandMark: { backgroundColor: '#d9683c', color: '#fff', borderRadius: 9, paddingVertical: 7, paddingHorizontal: 8, fontSize: 14, fontWeight: '700' },
  mobileBrandName: { color: '#fff', fontFamily: 'Georgia', fontSize: 14 },
  mobileBranch: { color: '#b9a99f', fontSize: 8, letterSpacing: 1.5, marginTop: 2 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#402e26' },
  closeIcon: { color: '#fff', fontSize: 25, lineHeight: 27 },
  breadcrumb: { color: '#82766e', fontSize: 12, flexShrink: 1 },
  location: { color: '#5e5149', fontSize: 11, borderWidth: 1, borderColor: '#e9e0d7', padding: 9, borderRadius: 8 },
  topbarSignOut: { color: '#b94f2b', fontSize: 11, fontWeight: '700' },
  content: { padding: 28, maxWidth: 1440, width: '100%' },
  contentMobile: { padding: 16 },
  heading: { marginBottom: 22 },
  eyebrow: { color: '#b94f2b', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: '#30251f', fontFamily: 'Georgia', fontSize: 34, marginTop: 7, marginBottom: 6 },
  subtitle: { color: '#82766e', fontSize: 12, lineHeight: 19 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  stat: { flexGrow: 1, flexBasis: 170, minHeight: 110, padding: 17, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 14 },
  statLabel: { color: '#82766e', fontSize: 11 },
  statValue: { color: '#30251f', fontSize: 24, fontWeight: '700', marginTop: 13 },
  statNote: { color: '#71815f', fontSize: 10, marginTop: 5 },
  card: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 14, padding: 20, marginBottom: 16 },
  cardTitle: { color: '#30251f', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  forecastTitle: { color: '#fff', backgroundColor: '#33241e', padding: 16, fontFamily: 'Georgia', fontSize: 20, marginVertical: 12, borderRadius: 10 },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 12, padding: 15, marginBottom: 10 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', color: '#30251f', fontSize: 12 },
  warning: { color: '#a65c2f', fontWeight: '700' },
  flex: { flex: 1 },
  button: { backgroundColor: '#d9683c', paddingVertical: 10, paddingHorizontal: 13, borderRadius: 8, alignSelf: 'flex-start', marginTop: 12 },
  buttonDark: { backgroundColor: '#33241e', padding: 13, borderRadius: 8, alignItems: 'center', marginTop: 14 },
  buttonSecondary: { borderWidth: 1, borderColor: '#e9e0d7', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 14 },
  deleteButton: { borderWidth: 1, borderColor: '#d9a99a', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7 },
  deleteButtonText: { color: '#a33f2d', fontSize: 11, fontWeight: '700' },
  deleteConfirmation: { borderWidth: 1, borderColor: '#d9a99a', borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: '#fff' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  confirmCancelButton: { borderWidth: 1, borderColor: '#e9e0d7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 7 },
  confirmCancelText: { color: '#5e5149', fontSize: 11, fontWeight: '700' },
  confirmDeleteButton: { backgroundColor: '#a33f2d', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 7 },
  confirmDeleteText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  input: { minHeight: 40, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 8, paddingHorizontal: 12, marginBottom: 16, fontSize: 12 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  productCard: { flexGrow: 1, flexBasis: 220, maxWidth: 330, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 13, padding: 16, marginBottom: 2 },
  productImage: { width: '100%', height: 150, borderRadius: 8, marginBottom: 12, backgroundColor: '#f3eee8' },
  productEmoji: { fontSize: 30, marginBottom: 12 },
  photoPicker: { minHeight: 150, backgroundColor: '#fff', borderWidth: 1, borderStyle: 'dashed', borderColor: '#cfc2b8', borderRadius: 9, marginBottom: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoPreview: { width: '100%', height: 150 },
  photoPickerText: { color: '#b94f2b', fontSize: 13, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', paddingVertical: 10 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', paddingVertical: 12 },
  quantity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3eee8', borderRadius: 14 },
  queueActions: { alignItems: 'flex-end', gap: 8 },
  smallButton: { backgroundColor: '#d9683c', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7 },
  notification: { backgroundColor: '#e7eddf', borderWidth: 1, borderColor: '#bdcdb0', borderRadius: 12, padding: 16, marginBottom: 16 },
  customerIdCard: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 },
  customerId: { color: '#30251f', fontSize: 16, fontWeight: '700', marginVertical: 5 },
  customerIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerIdInput: { flex: 1, marginBottom: 0 },
  scannerBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(20, 13, 10, 0.65)' },
  scannerSheet: { backgroundColor: '#fffefa', borderRadius: 12, padding: 16 },
  scanCamera: { width: '100%', height: 320, borderRadius: 8, overflow: 'hidden' },
  notificationTitle: { color: '#596849', fontSize: 15, fontWeight: '700', marginBottom: 5 },
  price: { color: '#5f4031', fontWeight: '700', fontSize: 14 },
  total: { color: '#30251f', fontWeight: '700', fontSize: 18, textAlign: 'right', marginTop: 16 },
  pill: { backgroundColor: '#e7eddf', color: '#596849', paddingVertical: 6, paddingHorizontal: 9, borderRadius: 20, fontSize: 10, fontWeight: '700' },
  promo: { backgroundColor: '#33241e', borderRadius: 14, padding: 22, marginBottom: 18 },
  promoTitle: { color: '#fff', fontFamily: 'Georgia', fontSize: 25, marginTop: 10, marginBottom: 8 },
  promoPrice: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 10 },
  reward: { backgroundColor: '#5f4031', borderRadius: 14, padding: 24 },
  rewardPoints: { color: '#fff', fontSize: 32, fontWeight: '700', marginVertical: 12 },
  progress: { height: 8, backgroundColor: '#866753', borderRadius: 8, marginTop: 15 },
  progressFill: { height: 8, width: '78%', backgroundColor: '#e8c4a7', borderRadius: 8 },
  chart: { color: '#d9683c', fontSize: 28, letterSpacing: 4, marginTop: 22, paddingVertical: 20 },
});
