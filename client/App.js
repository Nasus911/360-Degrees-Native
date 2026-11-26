import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from './lib/supabase';
import { requestApi, requestPublicApi } from './lib/api';
import IdentityVerification from './IdentityVerification';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { styles as groupStyles } from './styles';

const TextInput = React.forwardRef(function AppTextInput({ style, placeholderTextColor, ...props }, ref) {
  return (
    <NativeTextInput
      {...props}
      ref={ref}
      placeholderTextColor={placeholderTextColor || '#82766e'}
      selectionColor="#b94f2b"
      underlineColorAndroid="transparent"
      style={[styles.textInputDefaults, style]}
    />
  );
});

const roleConfig = {
  admin: { label: 'Head Admin', subtitle: 'Head administrator', initialPage: 'overview', pages: [['overview', 'Overview', '⌂'], ['branches', 'Branches', '⌖'], ['inventory', 'Inventory', '▪'], ['products', 'Products', '☕'], ['promotions', 'Promotions', '%'], ['loyalty', 'Loyalty rules', '◎'], ['team', 'Employees', '♙'], ['audit', 'Activity log', '◷']] },
  head_admin: { label: 'Head Admin', subtitle: 'Head administrator', initialPage: 'overview', pages: [['overview', 'Overview', '⌂'], ['branches', 'Branches', '⌖'], ['inventory', 'Inventory', '▪'], ['products', 'Products', '☕'], ['promotions', 'Promotions', '%'], ['loyalty', 'Loyalty rules', '◎'], ['team', 'Employees', '♙'], ['audit', 'Activity log', '◷']] },
  branch_admin: { label: 'Branch Admin', subtitle: 'Branch administrator', initialPage: 'overview', pages: [['overview', 'Overview', '⌂'], ['inventory', 'Inventory', '▪'], ['team', 'Employees', '♙'], ['receipts', 'Today orders', '◷'], ['audit', 'Activity log', '▣']] },
  cashier: { label: 'Barista/Cashier', subtitle: 'Barista/Cashier', initialPage: 'pos', pages: [['pos', 'Point of sale', '▣'], ['queue', 'Order queue', '◷'], ['receipts', 'Receipts', '▤']] },
  barista: { label: 'Barista/Cashier', subtitle: 'Barista/Cashier', initialPage: 'pos', pages: [['pos', 'Point of sale', '▣'], ['queue', 'Order queue', '◷'], ['receipts', 'Receipts', '▤']] },
  staff: { label: 'Barista/Cashier', subtitle: 'Barista/Cashier', initialPage: 'pos', pages: [['pos', 'Point of sale', '▣'], ['queue', 'Order queue', '◷'], ['receipts', 'Receipts', '▤']] },
  customer: { label: 'Customer', subtitle: '360 Rewards member', initialPage: 'home', pages: [['home', 'Home', '⌂'], ['menu', 'Menu', '☕'], ['orders', 'My orders', '◷'], ['wallet', 'Wallet & rewards', '◎'], ['identity-verification', 'Identity verification', 'ID'], ['account', 'Manage account', '♙'], ['branch', 'Pickup branch', '⌖']] },
  guest: { label: 'Guest', subtitle: 'Temporary guest account · no loyalty points', initialPage: 'home', pages: [['home', 'Home', '⌂'], ['menu', 'Menu', '☕'], ['orders', 'My orders', '◷'], ['branch', 'Pickup branch', '⌖']] },
};

const money = (amount) => `₱${Number(amount).toLocaleString('en-PH')}`;
const orderStatusLabels = {
  new: 'New',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const statusToApi = Object.fromEntries(Object.entries(orderStatusLabels).map(([value, label]) => [label, value]));
const toClientOrder = (order, user) => ({
  ...order,
  databaseId: order.id,
  id: order.order_number ? `SC-${order.order_number}` : order.id,
  customer: order.profiles?.full_name || (order.customer_id === user?.id ? user.name : order.customer_id ? 'Customer' : 'Walk-in'),
  customerEmail: order.profiles?.email || (order.customer_id === user?.id ? user.email : ''),
  status: orderStatusLabels[order.status] || order.status,
  channel: order.channel === 'online' ? 'Online' : 'Counter',
  items: (order.order_items || []).map((item) => {
    const customization = item.customization || {};
    const details = customization.size
      ? `${customization.size === 'large' ? 'Large' : 'Regular'}, ${customization.milk === 'oat' ? 'Oat milk' : 'Dairy'}, ${customization.sweetness ?? 100}% sweetness${customization.extraEspresso ? ', extra espresso' : ''}`
      : '';
    return `${item.product_name} × ${item.quantity}${details ? ` (${details})` : ''}`;
  }).join(', '),
  total: Number(order.total),
  promotionTitle: order.promotions?.title || '',
});
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

export default function App() {
  return <SafeAreaProvider>
    <StatusBar style={Platform.OS === 'android' ? 'light' : 'dark'} backgroundColor="#33241e" translucent={false} />
    <AppContent />
  </SafeAreaProvider>;
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsLoadError, setAccountsLoadError] = useState('');
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [dismissedPromoKey, setDismissedPromoKey] = useState('');
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [reportSummary, setReportSummary] = useState(null);
  const [reportError, setReportError] = useState('');
  const [role, setRole] = useState(null);
  const [page, setPage] = useState('overview');
  const [faceCaptureActive, setFaceCaptureActive] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartFeedback, setCartFeedback] = useState(null);
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [orderLoadError, setOrderLoadError] = useState('');
  const [orderStatusError, setOrderStatusError] = useState('');
  const [orderRetryCount, setOrderRetryCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationActionError, setNotificationActionError] = useState('');
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width < 700;
  const drawerWidth = Math.min(width * 0.82, 320);
  const drawerPosition = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cartButtonScale = useRef(new Animated.Value(1)).current;
  const cartFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const cartFeedbackTranslateY = useRef(new Animated.Value(10)).current;
  const cartFeedbackTimer = useRef(null);
  const drawerHasOpened = useRef(false);
  const config = roleConfig[role];
  const isHeadAdmin = role === 'admin' || role === 'head_admin';
  const currentBranch = branches.find((branch) => branch.id === (activeBranchId || user?.branchId));
  const branchName = currentBranch?.name || (isHeadAdmin ? 'All branches' : 'Branch unavailable');
  const branchLocation = currentBranch
    ? [currentBranch.city, currentBranch.address].filter(Boolean).join(' · ')
    : isHeadAdmin ? 'Organization-wide access' : 'Branch details unavailable';
  const branchProducts = useMemo(() => catalogProducts.filter((product) => product.category !== 'Inventory'
    && (!product.branch_id || !activeBranchId || product.branch_id === activeBranchId)), [activeBranchId, catalogProducts]);
  const visibleProducts = useMemo(() => branchProducts.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())), [branchProducts, search]);

  useEffect(() => () => {
    if (cartFeedbackTimer.current) clearTimeout(cartFeedbackTimer.current);
    cartButtonScale.stopAnimation();
    cartFeedbackOpacity.stopAnimation();
    cartFeedbackTranslateY.stopAnimation();
  }, [cartButtonScale, cartFeedbackOpacity, cartFeedbackTranslateY]);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    setOrders([]);
    setNotifications([]);
    const refreshOrders = async () => {
      try {
        const [loadedOrders, loadedNotifications] = await Promise.all([
          requestApi(`/api/orders${isHeadAdmin && activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : ''}`),
          role === 'customer' || isHeadAdmin ? requestApi('/api/notifications') : Promise.resolve(null),
        ]);
        if (!active) return;
        setOrders(loadedOrders.map((order) => toClientOrder(order, user)));
        if (loadedNotifications) setNotifications(loadedNotifications);
        setOrderLoadError('');
      } catch (error) {
        if (active) {
          setOrderLoadError(error.message || 'Unable to load orders from the server.');
          console.error('Order and notification refresh failure:', error.message);
        }
      }
    };
    refreshOrders();
    const orderChannel = supabase.channel(`orders-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshOrders)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && active) console.error('Live order updates are unavailable; periodic refresh remains enabled.');
      });
    const timer = setInterval(refreshOrders, 12000);
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(orderChannel).catch((error) => console.error('Order subscription cleanup failure:', error.message));
    };
  }, [activeBranchId, isHeadAdmin, role, user, orderRetryCount]);

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
    if (role === 'customer' || role === 'guest') {
      if (!supabase) {
        setBranches([]);
        return;
      }
      let active = true;
      const refreshBranches = async () => {
        try {
          const data = await requestApi('/api/branches');
          if (!active) return;
          setBranches(data);
          setActiveBranchId((current) => data.some((branch) => branch.id === current)
            ? current
            : user.branchId && data.some((branch) => branch.id === user.branchId)
              ? user.branchId
              : data[0]?.id || '');
        } catch (error) {
          if (active) console.error('Customer branch refresh failure:', error.message);
        }
      };
      refreshBranches();
      const timer = setInterval(refreshBranches, 10000);
      const channel = supabase.channel(`active-branches-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, refreshBranches)
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && active) console.error('Live branch updates are unavailable; periodic refresh remains enabled.');
        });
      return () => {
        active = false;
        clearInterval(timer);
        supabase.removeChannel(channel).catch((error) => console.error('Branch subscription cleanup failure:', error.message));
      };
    }
    if (!['admin', 'head_admin', 'branch_admin', 'cashier', 'barista', 'staff'].includes(role)) return;
    if (!supabase) {
      setBranches([]);
      return;
    }
    let active = true;
    const refreshAdminBranches = async () => {
      try {
        const data = await requestApi('/api/admin/branches');
        if (!active) return;
        setBranches(data);
        if (role === 'branch_admin' || role === 'cashier' || role === 'barista' || role === 'staff') {
          const assignedBranch = user.branchId || data[0]?.id || '';
          setActiveBranchId((current) => (assignedBranch && current !== assignedBranch ? assignedBranch : current || assignedBranch));
        }
      } catch (error) {
        if (active) console.error('Branch loading failure:', error.message);
      }
    };
    refreshAdminBranches();
    const timer = setInterval(refreshAdminBranches, 10000);
    const channel = supabase.channel(`admin-branches-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, refreshAdminBranches)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && active) console.error('Live branch updates are unavailable; periodic refresh remains enabled.');
      });
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel).catch((error) => console.error('Branch subscription cleanup failure:', error.message));
    };
  }, [role, user]);

  useEffect(() => {
    if (!supabase || !user || !['admin', 'head_admin', 'branch_admin'].includes(role)) return;
    let active = true;
    setAccounts([]);
    setAccountsLoading(true);
    setAccountsLoadError('');
    requestApi('/api/admin/accounts').then((data) => {
      if (active) {
        setAccounts(data.map((account) => ({
          ...account,
          name: account.full_name,
          contactNumber: account.contact_number || '',
          branchId: account.branch_id,
          isActive: account.is_active,
        })));
      }
    }).catch((error) => {
      if (active) {
        setAccountsLoadError(error.message || 'Unable to load registered accounts.');
        console.error('Employee list lookup failure:', error.message);
      }
    }).finally(() => {
      if (active) setAccountsLoading(false);
    });
    return () => { active = false; };
  }, [role, user]);

  useEffect(() => {
    if (page !== 'overview' || !user || !['admin', 'head_admin', 'branch_admin'].includes(role)) return;
    if (!supabase) {
      setReportSummary(null);
      return;
    }
    let active = true;
    const query = activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : '';
    const refreshSummary = async () => {
      try {
        const summary = await requestApi(`/api/admin/reports/summary${query}`);
        if (active) {
          setReportSummary(summary);
          setReportError('');
        }
      } catch (error) {
        if (active) {
          setReportError(error.message || 'Unable to load analytics from the database.');
          console.error('Report loading failure:', error.message);
        }
      }
    };
    refreshSummary();
    const timer = setInterval(refreshSummary, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [activeBranchId, page, role, user]);

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
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && active) {
        setUser(null);
        setRole(null);
        setPage('overview');
        setCart([]);
        setSearch('');
        setNotifications([]);
      }
    });
    const processAuthUrl = async (url) => {
      if (!url) return;
      try {
        const normalizedUrl = url.includes('#') ? url.replace('#', '?') : url;
        const parsed = new URL(normalizedUrl);
        const code = parsed.searchParams.get('code');
        const accessToken = parsed.searchParams.get('access_token');
        const refreshToken = parsed.searchParams.get('refresh_token');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          return;
        }
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (active && session?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (profileError) throw profileError;
          if (profile && roleConfig[profile.role]) {
            setUser({ id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, contactNumber: profile.contact_number || '', address: profile.address || '', customerCode: profile.customer_code, rewardPoints: profile.reward_points || 0, branchId: profile.branch_id, guestExpiresAt: profile.guest_expires_at });
            setRole(profile.role);
            setPage(roleConfig[profile.role].initialPage);
            setAuthError('');
          }
        }
      } catch (error) {
        if (active) setAuthError(error.message || 'Unable to confirm your email.');
      }
    };
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (error) throw error;
          if (profile?.role === 'guest' && (!profile.guest_expires_at || Date.parse(profile.guest_expires_at) <= Date.now())) {
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) throw signOutError;
            if (active) setAuthError('Your guest account has expired. Start a new guest session to continue.');
            return;
          }
          if (active && profile && roleConfig[profile.role]) {
            setUser({ id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, contactNumber: profile.contact_number || '', address: profile.address || '', customerCode: profile.customer_code, rewardPoints: profile.reward_points || 0, branchId: profile.branch_id, guestExpiresAt: profile.guest_expires_at });
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
    const linkSubscription = Linking.addEventListener('url', ({ url }) => processAuthUrl(url));
    Linking.getInitialURL().then((url) => processAuthUrl(url)).finally(restoreSession);
    return () => {
      active = false;
      authSubscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  if (!user || !config) {
    if (!supabase) return <ServiceUnavailableScreen />;
    if (authLoading) return <SafeAreaView style={styles.authSafeArea}><Text style={styles.authSubtitle}>Loading your account...</Text></SafeAreaView>;
    return <AuthScreen authError={authError} onGuest={async (fullName) => {
      const result = await requestPublicApi('/api/auth/guest', {
        method: 'POST',
        body: JSON.stringify({ fullName }),
      });
      if (!result?.session || !result?.profile?.id) {
        throw new Error('The guest service returned an incomplete account response. Try again.');
      }
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      const guest = {
        id: result.profile.id,
        name: result.profile.full_name,
        email: result.profile.email,
        role: 'guest',
        customerCode: result.profile.customer_code,
        guestExpiresAt: result.profile.guest_expires_at,
      };
      setUser(guest);
      setRole('guest');
      setPage(roleConfig.guest.initialPage);
    }} onLogin={async (account) => {
      const result = await requestPublicApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(account),
      });
      if (!result?.session?.access_token || !result.session.refresh_token || !result.profile?.id) {
        throw new Error('The login service returned an incomplete response. Try again.');
      }
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      const profile = result.profile;
      if (!profile || !roleConfig[profile.role]) throw new Error('Your account profile is incomplete. Contact an administrator.');
      if (profile.is_active === false) throw new Error('This account is inactive. Contact a head administrator.');
      const signedIn = { id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, contactNumber: profile.contact_number || '', address: profile.address || '', customerCode: profile.customer_code, rewardPoints: profile.reward_points || 0, branchId: profile.branch_id, guestExpiresAt: profile.guest_expires_at };
      setUser(signedIn); setRole(signedIn.role); setPage(roleConfig[signedIn.role].initialPage);
    }} onRegister={async (account) => {
      const { data, error } = await supabase.auth.signUp({
        email: account.email,
        password: account.password,
        options: {
          data: { full_name: account.name, contact_number: account.contactNumber },
          emailRedirectTo: '360degrees://auth/callback',
        },
      });
      if (error) {
        if (error.message?.toLowerCase().includes('email rate limit')) {
          throw new Error('Email sending is temporarily unavailable. Please try again later or contact support.');
        }
        throw error;
      }
      if (!data.session) throw new Error('Registration succeeded. Confirm your email before signing in.');
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      if (profileError) throw profileError;
      const registered = { ...account, customerCode: profile.customer_code, rewardPoints: profile.reward_points || 0, id: profile.id };
      setUser(registered); setRole('customer'); setPage(roleConfig.customer.initialPage);
    }} />;
  }

  const showCartFeedback = (productName) => {
    if (cartFeedbackTimer.current) clearTimeout(cartFeedbackTimer.current);
    cartButtonScale.stopAnimation();
    cartFeedbackOpacity.stopAnimation();
    cartFeedbackTranslateY.stopAnimation();
    cartButtonScale.setValue(0.88);
    cartFeedbackOpacity.setValue(0);
    cartFeedbackTranslateY.setValue(10);
    setCartFeedback({ productName });
    Animated.parallel([
      Animated.timing(cartFeedbackOpacity, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.timing(cartFeedbackTranslateY, { toValue: 0, duration: 160, useNativeDriver: false }),
      Animated.sequence([
        Animated.spring(cartButtonScale, { toValue: 1.12, speed: 28, bounciness: 10, useNativeDriver: false }),
        Animated.spring(cartButtonScale, { toValue: 1, speed: 22, bounciness: 10, useNativeDriver: false }),
      ]),
    ]).start();
    cartFeedbackTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cartFeedbackOpacity, { toValue: 0, duration: 220, useNativeDriver: false }),
        Animated.timing(cartFeedbackTranslateY, { toValue: 8, duration: 220, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (finished) setCartFeedback(null);
      });
    }, 1500);
  };
  const addToCart = (product, customization = { size: 'regular', milk: 'dairy', sweetness: 100, extraEspresso: false }) => {
    const priceAdjustment = (customization.size === 'large' ? 50 : 0)
      + (customization.milk === 'oat' ? 35 : 0)
      + (customization.extraEspresso ? 50 : 0);
    const customizationKey = JSON.stringify(customization);
    const id = `${product.id}:${customizationKey}`;
    const item = {
      ...product,
      id,
      productId: product.id,
      price: Number(product.price) + priceAdjustment,
      quantity: 1,
      customization,
      priceAdjustment,
    };
    setCart((current) => {
      const existing = current.find((line) => line.id === id);
      return existing
        ? current.map((line) => (line.id === id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, item];
    });
    showCartFeedback(product.name);
  };
  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    setUser(null); setRole(null); setPage('overview'); setCart([]); setSearch(''); setNotifications([]);
  };
  const saveAccountProfile = async ({ fullName, contactNumber, address }) => {
    const result = await requestApi('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ fullName, contactNumber, address }),
    });
    setUser((current) => ({ ...current, name: result.full_name, contactNumber: result.contact_number, address: result.address || '' }));
  };
  const changeAccountPassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };
  const recordActivity = async (action, entityType, entityId, details = {}, branchId = activeBranchId || user.branchId || null) => {
    const { error } = await supabase.from('activity_logs').insert({ actor_id: user.id, branch_id: branchId, action, entity_type: entityType, entity_id: String(entityId), details });
    if (error) console.error('Activity log write failure:', error.message);
  };
  const createProduct = async ({ name, category, price, unitCost, initialStock, description, photo, branchId }) => {
    if (!supabase) throw new Error('Account service is unavailable.');
    let imageUrl = photo.uri;
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
  };
  const deleteProduct = async (product) => {
    const { error: inventoryError } = await supabase.from('inventory').delete().eq('product_id', product.id);
    if (inventoryError) throw inventoryError;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) throw error;
    const imagePath = product.imageUrl?.split('/storage/v1/object/public/product-images/')[1]?.split('?')[0];
    if (imagePath) {
      const { error: imageError } = await supabase.storage.from('product-images').remove([decodeURIComponent(imagePath)]);
      if (imageError) console.warn('Product image cleanup failure:', imageError.message);
    }
    setCatalogProducts((current) => current.filter((item) => item.id !== product.id));
    setPromotions((current) => current.map((promotion) => promotion.productId === product.id ? { ...promotion, productId: null } : promotion));
    await recordActivity('product.deleted', 'product', product.id, { name: product.name }, product.branch_id);
  };
  const createPromotion = async ({ title, description, productId, promoType, buyQuantity, getQuantity, discountValue, branchId }) => {
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
  };
  const deletePromotion = async (promotion) => {
    const { error } = await supabase.from('promotions').delete().eq('id', promotion.id);
    if (error) throw error;
    setPromotions((current) => current.filter((item) => item.id !== promotion.id));
    await recordActivity('promotion.deleted', 'promotion', promotion.id, { title: promotion.title }, null);
  };
  const createBranch = async (branch) => {
    const created = await requestApi('/api/admin/branches', { method: 'POST', body: JSON.stringify(branch) });
    setBranches((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
    return created;
  };
  const toggleBranch = async (branch) => {
    const updated = await requestApi(`/api/admin/branches/${branch.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !branch.is_active }) });
    setBranches((current) => current.map((item) => item.id === branch.id ? updated : item));
    return updated;
  };
  const saveLoyaltySettings = async (settings) => {
    const { error } = await supabase.from('loyalty_settings').upsert({ id: 1, ...settings, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    await recordActivity('loyalty.rules_updated', 'loyalty_settings', '1', settings, null);
  };
  const redeemReward = async (rewardId) => requestApi('/api/loyalty/redeem', { method: 'POST', body: JSON.stringify({ rewardId }) });
  const placePosOrder = async (customerCode) => {
    if (!cart.length) return;
    setCheckoutNotice('');
    setCheckoutError('');
    try {
      const result = await requestApi('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({ branchId: activeBranchId || user.branchId, customerCode, items: cart.map((item) => ({ productId: item.productId || item.id, quantity: item.quantity, customization: item.customization })) }),
      });
      setOrders((current) => [toClientOrder({
        ...result.order,
        order_items: result.items,
        promotions: { title: result.promotion?.title },
      }, user), ...current]);
      setCheckoutNotice(`${result.promotion?.title ? `${result.promotion.title} applied. ` : ''}${result.pointsEarned ? `${result.pointsEarned} loyalty points earned.` : 'Sale completed.'}`);
      setCart([]);
      return result;
    } catch (error) {
      setCheckoutError(error.message || 'Unable to complete checkout.');
      return;
    }
  };
  const placeOrder = async (pickupAt = null, paymentMethod = 'fake_money') => {
    if (!cart.length) return;
    setCheckoutNotice('');
    setCheckoutError('');
    const branchId = activeBranchId || user.branchId || branches[0]?.id;
    if (!branchId) return setCheckoutNotice('Choose an active branch before placing your order.');
    try {
      const result = await requestApi('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({ branchId, pickupAt, paymentMethod, items: cart.map((item) => ({ productId: item.productId || item.id, quantity: item.quantity, customization: item.customization })) }),
      });
      setOrders((current) => [toClientOrder({
        ...result.order,
        order_items: result.items,
        promotions: { title: result.promotion?.title },
      }, user), ...current]);
      if (result.pointsBalance != null) setUser((current) => ({ ...current, rewardPoints: result.pointsBalance }));
      setCheckoutNotice(`${paymentMethod === 'points' ? `${result.pointsRedeemed} points used. ` : 'Simulated payment successful. '}${result.promotion?.title ? `${result.promotion.title} applied. ` : ''}${result.pointsEarned ? `${result.pointsEarned} points earned.` : role === 'guest' ? 'Guest order placed. No loyalty points are earned on guest accounts.' : paymentMethod === 'points' ? 'No points earned on points-paid orders.' : 'Order placed.'}`);
      setCart([]);
      setCartOpen(false);
    } catch (orderError) { setCheckoutError(orderError.message || 'Unable to place order.'); }
  };
  const updateOrderStatus = async (orderId, status) => {
    const order = orders.find((current) => current.id === orderId);
    setOrderStatusError('');
    if (!order) {
      setOrderStatusError('This order is no longer loaded. Refresh the queue and try again.');
      return;
    }
    try {
      const updated = await requestApi(`/api/orders/${order.databaseId || order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusToApi[status] || status }),
      });
      setOrders((current) => current.map((item) => item.id === orderId
        ? { ...item, status: orderStatusLabels[updated.status] || updated.status }
        : item));
      if (status === 'Ready for pickup') {
        setNotifications((current) => [{
          id: `${orderId}-ready`,
          title: 'Your order is ready for pickup',
          message: `Order #${orderId} is ready for pickup.`,
          created_at: new Date().toISOString(),
        }, ...current]);
      }
    } catch (error) {
      const message = error.message || 'Please try again.';
      setOrderStatusError(message);
      console.error('Order status update failure:', message);
    }
  };
  const dismissNotification = async (notificationId) => {
    setNotificationActionError('');
    try {
      const { error } = await supabase.from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);
      if (error) throw error;
      setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    } catch (error) {
      setNotificationActionError(`Unable to dismiss notification: ${error.message || 'Please try again.'}`);
    }
  };
  const navigate = (nextPage) => {
    const allowedPage = config.pages.some(([id]) => id === nextPage) ? nextPage : config.initialPage;
    setPage(allowedPage);
    setMenuOpen(false);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={faceCaptureActive ? [] : ['top', 'right', 'bottom', 'left']}>
      <View style={[styles.app, isMobile && styles.appMobile]}>
        {!faceCaptureActive && isMobile && <Animated.View pointerEvents={menuOpen ? 'auto' : 'none'} style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.drawerBackdropPressable} onPress={() => setMenuOpen(false)} accessibilityLabel="Close navigation menu" />
        </Animated.View>}
        {!faceCaptureActive && <Animated.View style={[styles.sidebar, isMobile && styles.sidebarMobile, isMobile && { width: drawerWidth, transform: [{ translateX: drawerPosition }] }]}>
          <View style={styles.brand}><BrandLogo size={isMobile ? Math.min(44, Math.max(34, width * 0.11)) : Math.min(60, Math.max(44, width * 0.055))} /><View style={styles.brandDetails}><Text style={styles.brandName}>360 Degrees Specialty Cafe</Text><Text style={styles.branch}>{branchName}</Text></View>{isMobile && <Pressable onPress={() => setMenuOpen(false)} style={styles.closeButton} accessibilityLabel="Close navigation menu"><Text style={styles.closeIcon}>×</Text></Pressable>}</View>
          <Text style={styles.label}>{role === 'customer' ? 'Your coffee shop' : `${config.label} workspace`}</Text>
          <View style={styles.nav}>{config.pages.map(([id, label, icon]) => <Pressable key={id} onPress={() => navigate(id)} style={[styles.navButton, page === id && styles.navButtonActive]}><Text style={styles.navIcon}>{icon}</Text><Text style={[styles.navText, page === id && styles.navTextActive]}>{label}</Text></Pressable>)}</View>
          <View style={styles.sidebarFooter}><Text style={styles.store}>{branchName}</Text><Text style={styles.sidebarMuted}>{branchLocation}</Text><Text style={styles.person}>{user.name}</Text><Text style={styles.sidebarMuted}>{config.subtitle}</Text><Pressable onPress={signOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable></View>
        </Animated.View>}
        <View style={styles.main}>
          <PageBackground variant={role === 'customer' || role === 'guest' ? 'shop' : 'dashboard'}>
          {!faceCaptureActive && isMobile && <View style={styles.mobileHeader}><Pressable onPress={() => setMenuOpen((open) => !open)} style={styles.menuButton} accessibilityLabel="Open navigation menu"><Text style={styles.menuIcon}>☰</Text></Pressable><View style={styles.mobileBrand}><BrandLogo size={Math.min(44, Math.max(34, width * 0.11))} /><View><Text style={styles.mobileBrandName}>360 Degrees Specialty Cafe</Text><Text style={styles.mobileBranch}>{branchName}</Text></View></View></View>}
          {!faceCaptureActive && <View style={[styles.topbar, isMobile && styles.topbarMobile]}><Text style={styles.breadcrumb}>360 Degrees Specialty Cafe  /  {config.pages.find(([id]) => id === page)?.[1]}</Text><Text style={[styles.topbarTagline, (role === 'customer' || role === 'guest') && styles.topbarTaglineLight, isMobile && styles.topbarTaglineMobile]}>“A full circle of flavor &amp; comfort”</Text><View style={styles.topbarActions}>{isHeadAdmin && notifications.length > 0 && <Pressable style={styles.location} onPress={() => navigate('inventory')}><Text>Alerts · {notifications.length}</Text></Pressable>}<Pressable style={styles.location} onPress={() => (isHeadAdmin ? navigate('branches') : ['customer', 'guest'].includes(role) ? navigate('branch') : null)}><Text>{activeBranchId ? `⌖  ${branches.find((branch) => branch.id === activeBranchId)?.name || 'Selected branch'}` : isHeadAdmin ? '⌖  All branches' : '⌖  Assigned branch'}</Text></Pressable></View></View>}
          <ScrollView
            style={faceCaptureActive && styles.captureScroll}
            contentContainerStyle={faceCaptureActive
              ? styles.captureContent
              : [styles.content, isMobile && styles.contentMobile, (role === 'customer' || role === 'guest') && styles.contentWithCart]}
            scrollEnabled={!faceCaptureActive}
          >
            {!faceCaptureActive && notificationActionError ? <Text accessibilityRole="alert" style={styles.formError}>{notificationActionError}</Text> : null}
            {page === 'overview' && <AdminOverview summary={reportSummary} reportError={reportError} onNavigate={navigate} branches={branches} selectedBranchId={activeBranchId} onSelectBranch={setActiveBranchId} isHeadAdmin={isHeadAdmin} />}
            {page === 'branches' && <Branches branches={branches} selectedBranchId={activeBranchId} onSelectBranch={setActiveBranchId} onCreateBranch={createBranch} onToggleBranch={toggleBranch} />}
            {page === 'inventory' && <Inventory branchId={activeBranchId || user.branchId} isHeadAdmin={isHeadAdmin} notifications={isHeadAdmin ? notifications : []} onDismissNotification={dismissNotification} branches={branches} />}
            {page === 'products' && <AdminProducts products={catalogProducts} branches={branches} defaultBranchId={user.branchId || activeBranchId} isHeadAdmin={isHeadAdmin} onCreateProduct={createProduct} onDeleteProduct={deleteProduct} />}
            {page === 'promotions' && <Promotions promotions={promotions} products={catalogProducts.filter((product) => product.category !== 'Inventory')} branches={branches} defaultBranchId={user.branchId || activeBranchId} isHeadAdmin={isHeadAdmin} onCreatePromotion={createPromotion} onDeletePromotion={deletePromotion} />}
            {page === 'loyalty' && <LoyaltyAdmin onSave={saveLoyaltySettings} />}
            {page === 'audit' && <AuditLogs branchId={isHeadAdmin ? null : user.branchId} />}
            {page === 'team' && <TeamAccounts accounts={accounts} loading={accountsLoading} loadError={accountsLoadError} branches={branches} isHeadAdmin={isHeadAdmin} branchId={user.branchId || activeBranchId} onCreate={(account) => setAccounts((current) => [...current, account])} onToggleAccount={async (account) => {
              const updated = await requestApi(`/api/admin/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !account.isActive }) });
              setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, ...updated, isActive: updated.is_active ?? updated.isActive } : item));
            }} />}
            {page === 'pos' && <Pos visibleProducts={visibleProducts} promotions={promotions} branchId={activeBranchId || user.branchId} checkoutNotice={checkoutNotice} checkoutError={checkoutError} search={search} setSearch={setSearch} cart={cart} onAdd={addToCart} onPlaceOrder={placePosOrder} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0))} />}
            {page === 'queue' && <Queue orders={orders} onUpdateStatus={updateOrderStatus} loadError={orderLoadError} statusError={orderStatusError} onRetry={() => setOrderRetryCount((count) => count + 1)} />}
            {page === 'receipts' && <Receipts orders={orders} />}
            {page === 'home' && <CustomerHome products={branchProducts} promotions={promotions} branchId={activeBranchId} branches={branches} checkoutNotice={checkoutNotice} checkoutError={checkoutError} user={user} orders={orders} notifications={notifications} dismissedPromoKey={dismissedPromoKey} onDismissNotification={dismissNotification} onDismissPromotion={setDismissedPromoKey} onNavigate={navigate} onAdd={addToCart} />}
            {page === 'menu' && <Products visibleProducts={visibleProducts} search={search} setSearch={setSearch} onAdd={addToCart} checkoutNotice={checkoutNotice} checkoutError={checkoutError} />}
            {page === 'orders' && <Orders orders={orders} user={user} />}
            {page === 'wallet' && role === 'customer' && <Wallet user={user} onRedeem={redeemReward} />}
            {page === 'identity-verification' && role === 'customer' && <IdentityVerification
              user={user}
              onCaptureActiveChange={(active) => {
                setFaceCaptureActive(active);
                if (active) {
                  setMenuOpen(false);
                  setCartOpen(false);
                }
              }}
            />}
            {page === 'account' && <ManageAccount user={user} onSaveProfile={saveAccountProfile} onChangePassword={changeAccountPassword} />}
            {page === 'branch' && <BranchPicker branches={branches.filter((branch) => branch.is_active !== false)} selectedBranchId={activeBranchId} onSelectBranch={(id) => { setActiveBranchId(id); navigate('home'); }} />}
          </ScrollView>
          {!faceCaptureActive && cartFeedback && <Animated.View accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.cartFeedback, { bottom: (role === 'customer' || role === 'guest') ? 82 : 20, opacity: cartFeedbackOpacity, transform: [{ translateY: cartFeedbackTranslateY }] }]}>
            <View style={styles.cartFeedbackCheck}><Text style={styles.cartFeedbackCheckText}>✓</Text></View>
            <View style={styles.cartFeedbackCopy}><Text style={styles.cartFeedbackTitle}>Added to cart</Text><Text style={styles.cartFeedbackName} numberOfLines={1}>{cartFeedback.productName}</Text></View>
          </Animated.View>}
          {!faceCaptureActive && (role === 'customer' || role === 'guest') && <>
            <Animated.View style={[styles.cartFloatingButton, { transform: [{ scale: cartButtonScale }] }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open cart, ${cart.reduce((sum, item) => sum + item.quantity, 0)} items`} style={styles.cartFloatingPressable} onPress={() => setCartOpen(true)}>
                <Text style={styles.cartFloatingText}>Cart · {cart.reduce((sum, item) => sum + item.quantity, 0)}</Text>
              </Pressable>
            </Animated.View>
            <Modal visible={cartOpen} transparent animationType="slide" onRequestClose={() => setCartOpen(false)}>
              <View style={styles.cartModalBackdrop}>
                <View style={styles.cartModalSheet}>
                  <View style={styles.cartModalHeader}><Text style={styles.title}>Your cart</Text><Pressable accessibilityRole="button" accessibilityLabel="Close cart" style={styles.closeButtonLight} onPress={() => setCartOpen(false)}><Text style={styles.closeIconLight}>×</Text></Pressable></View>
                  <ScrollView keyboardShouldPersistTaps="handled">
                    <CartPanel cart={cart} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0))} onPlaceOrder={placeOrder} schedulePickup customerPayment={role === 'customer'} availablePoints={user.rewardPoints || 0} promotions={promotions} branchId={activeBranchId || user.branchId} />
                    {checkoutNotice ? <Text style={styles.successText}>{checkoutNotice}</Text> : null}
                    {checkoutError ? <Text style={styles.formError}>{checkoutError}</Text> : null}
                  </ScrollView>
                </View>
              </View>
            </Modal>
          </>}
          </PageBackground>
        </View>
      </View>
    </SafeAreaView>
  );
}

function BrandLogo({ size = 48 }) {
  return <Image source={require('./assets/brand-logo.png')} resizeMode="contain" style={[styles.brandLogoImage, { width: size, height: size }]} accessible accessibilityRole="image" accessibilityLabel="360 Degrees Cafe logo" />;
}

function PageBackground({ variant, children }) {
  const isShop = variant === 'shop';
  return <ImageBackground
    source={isShop ? require('./assets/cafe-bg.jpg') : require('./assets/dashboard-bg.jpg')}
    resizeMode="cover"
    style={styles.pageBackground}
    imageStyle={styles.pageBackgroundImage}
  >
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, isShop ? styles.shopBackgroundTint : styles.dashboardBackgroundTint]} />
    {children}
  </ImageBackground>;
}

function ServiceUnavailableScreen() {
  return <ImageBackground source={require('./assets/cafe-bg.jpg')} resizeMode="cover" style={styles.authRoot} imageStyle={styles.authBackgroundImage}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.authBackgroundTint]} />
    <SafeAreaView style={styles.authSafeArea}>
      <View style={styles.authPage}>
        <View style={styles.authCard}>
          <View style={styles.authBrand}>
            <BrandLogo size={64} />
            <View style={styles.authBrandDetails}>
              <Text style={styles.brandNameDark}>360 Degrees Specialty Cafe</Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>Account access</Text>
          <Text style={styles.authTitle}>Service unavailable</Text>
          <Text style={styles.authSubtitle}>The account service is not available in this build. Please try again later or contact support.</Text>
        </View>
      </View>
    </SafeAreaView>
  </ImageBackground>;
}

function AuthScreen({ authError, onLogin, onRegister, onGuest }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const passwordRef = useRef(null);
  const { width } = useWindowDimensions();

  const submit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'register') {
      if (!name.trim()) return setError('Enter your full name.');
      if (!contactNumber.trim()) return setError('Enter a contact number.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
      return onRegister({ name: name.trim(), email: normalizedEmail, password, contactNumber: contactNumber.trim() }).catch((submitError) => setError(submitError.message));
    }
    return onLogin({ email: normalizedEmail, password }).catch((submitError) => setError(submitError.message));
  };

  const switchMode = () => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); };
  const startGuestSession = () => {
    const fullName = guestName.trim();
    if (fullName.length < 2 || fullName.length > 100) return setError('Enter your name (2–100 characters).');
    setGuestSubmitting(true);
    setError('');
    return onGuest(fullName)
      .catch((guestError) => setError(guestError.message || 'Unable to start a guest account.'))
      .finally(() => setGuestSubmitting(false));
  };
  return <PageBackground variant="shop">
    <SafeAreaView style={styles.authSafeArea}>
    <KeyboardAvoidingView style={styles.authKeyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={[styles.authPage, width < 480 && styles.authPageCompact]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={[styles.authCard, width < 480 && styles.authCardCompact]}>
        <View style={styles.authBrand}>
        <BrandLogo size={width < 360 ? 56 : width < 480 ? 64 : 76} />
        <View style={styles.authBrandDetails}>
            <Text style={styles.brandNameDark}>360 Degrees Specialty Cafe</Text>
          </View>
        </View>
        {mode !== 'guest' && <View style={styles.authTabs}>
          <Pressable onPress={() => { setMode('login'); setError(''); }} style={[styles.authTab, mode === 'login' && styles.authTabActive]}>
            <Text style={[styles.authTabText, mode === 'login' && styles.authTabTextActive]}>Sign In</Text>
          </Pressable>
          <Pressable onPress={() => { setMode('register'); setError(''); }} style={[styles.authTab, mode === 'register' && styles.authTabActive]}>
            <Text style={[styles.authTabText, mode === 'register' && styles.authTabTextActive]}>Sign Up</Text>
          </Pressable>
        </View>}
        <Text style={styles.eyebrow}>{mode === 'login' ? 'Welcome back' : mode === 'guest' ? 'Guest checkout' : 'Join 360 rewards'}</Text>
        <Text style={[styles.authTitle, width < 480 && styles.authTitleCompact]}>{mode === 'login' ? 'Sign in to your workspace' : mode === 'guest' ? 'Who is picking up?' : 'Create your account'}</Text>
        <Text style={[styles.authSubtitle, width < 480 && styles.authSubtitleCompact]}>{mode === 'login' ? 'Use your account to access the workspace assigned to you.' : mode === 'guest' ? 'Enter your name so the barista can identify your order.' : 'New accounts start as customer accounts.'}</Text>
        {mode === 'guest' && <TextInput value={guestName} onChangeText={setGuestName} placeholder="Your name *" placeholderTextColor="#82766e" autoCapitalize="words" autoComplete="name" returnKeyType="done" onSubmitEditing={startGuestSession} style={styles.authInput} />}
        {mode === 'register' && <Text style={styles.authFieldLabel}>Full name</Text>}
        {mode === 'register' && <TextInput value={name} onChangeText={setName} placeholder="Enter your full name" placeholderTextColor="#594a41" autoCapitalize="words" style={[styles.authInput, styles.authInputEmphasized]} />}
        {mode === 'register' && <Text style={styles.authFieldLabel}>Email address</Text>}
        {mode !== 'guest' && <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={mode === 'register' ? '#594a41' : '#82766e'} autoCapitalize="none" keyboardType="email-address" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} style={[styles.authInput, mode === 'register' && styles.authInputEmphasized]} />}
        {mode === 'register' && <Text style={styles.authFieldLabel}>Contact number</Text>}
        {mode === 'register' && <TextInput value={contactNumber} onChangeText={setContactNumber} placeholder="Enter your contact number" placeholderTextColor="#594a41" keyboardType="phone-pad" style={[styles.authInput, styles.authInputEmphasized]} />}
        {mode === 'register' && <Text style={styles.authFieldLabel}>Password</Text>}
        {mode !== 'guest' && <PasswordInput inputRef={passwordRef} value={password} onChangeText={setPassword} placeholder="Password (8+ characters)" visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} returnKeyType={mode === 'login' ? 'go' : 'next'} onSubmitEditing={mode === 'login' ? submit : undefined} placeholderTextColor={mode === 'register' ? '#594a41' : '#82766e'} wrapperStyle={mode === 'register' && styles.passwordInputWrapperEmphasized} />}
        {mode === 'register' && <Text style={styles.authFieldLabel}>Confirm password</Text>}
        {mode === 'register' && <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} placeholderTextColor="#594a41" wrapperStyle={styles.passwordInputWrapperEmphasized} />}
        {authError ? <Text style={styles.formError}>{authError}</Text> : null}
        {error ? <Text style={styles.formError}>{error}</Text> : null}
        {mode !== 'guest' ? <Pressable style={styles.authButton} onPress={submit}>
          <Text style={styles.buttonText}>{mode === 'login' ? 'Sign In' : 'Sign Up'}</Text>
        </Pressable> : <>
          <Pressable disabled={guestSubmitting} style={[styles.authButton, guestSubmitting && styles.disabled]} onPress={startGuestSession}><Text style={styles.buttonText}>{guestSubmitting ? 'Starting guest session...' : 'Continue as Guest'}</Text></Pressable>
          <Pressable style={styles.authSwitch} onPress={() => { setMode('login'); setError(''); }}><Text style={styles.authSwitchText}>Back to sign in</Text></Pressable>
        </>}
        {mode === 'login' && <Pressable style={styles.guestButton} onPress={() => { setMode('guest'); setError(''); }}>
          <Text style={styles.guestButtonText}>Continue as Guest Account</Text>
          <Text style={styles.guestHint}>Temporary access · no loyalty points</Text>
        </Pressable>}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  </PageBackground>;
}

function PasswordInput({ value, onChangeText, placeholder, visible, onToggle, inputRef, returnKeyType, onSubmitEditing, placeholderTextColor = '#82766e', wrapperStyle }) {
  return <View style={[styles.passwordInputWrapper, wrapperStyle]}><TextInput ref={inputRef} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={placeholderTextColor} secureTextEntry={!visible} returnKeyType={returnKeyType} onSubmitEditing={onSubmitEditing} style={styles.passwordInput} /><Pressable onPress={onToggle} style={styles.passwordToggle} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}><Text style={styles.passwordToggleText}>{visible ? 'Hide' : 'Show'}</Text></Pressable></View>;
}

function TeamAccounts({ accounts, loading, loadError, branches, isHeadAdmin, branchId: assignedBranchId, onCreate, onToggleAccount }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountRole, setAccountRole] = useState(isHeadAdmin ? 'branch_admin' : 'staff');
  const [branchId, setBranchId] = useState(assignedBranchId || '');
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const roles = isHeadAdmin ? ['branch_admin', 'staff', 'customer'] : ['staff'];
  const roleLabel = (value) => ({ admin: 'Head Admin', head_admin: 'Head Admin', branch_admin: 'Branch Admin', cashier: 'Barista/Cashier', barista: 'Barista/Cashier', staff: 'Barista/Cashier', customer: 'Customer' })[value] || value;
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
    setNotice('');
    try {
      const result = await requestApi('/api/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({
          fullName: name.trim(),
          email: normalizedEmail,
          password,
          role: accountRole,
          branchId: accountRole === 'customer' ? null : (isHeadAdmin ? branchId : assignedBranchId),
          contactNumber: contactNumber.trim(),
          address: address.trim(),
        }),
      });
      const account = {
        id: result.id,
        name: result.full_name,
        email: result.email,
        role: result.role,
        branchId: result.branch_id,
        isActive: result.is_active,
        contactNumber: result.contact_number,
        address: result.address,
      };
      onCreate(account);
      setName('');
      setEmail('');
      setPassword('');
      setShowTemporaryPassword(false);
      setContactNumber('');
      setAddress('');
      setNotice(`The ${roleLabel(accountRole)} account can now sign in with this email and password.`);
    } catch (submitError) {
      setError(submitError.message || 'Unable to create account.');
    } finally {
      setCreating(false);
    }
  };
  return <>
    <Header eyebrow="Admin controls" title="Team accounts" subtitle="Create Barista/Cashier, branch administrator, or customer accounts." />
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
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.successText}>{notice}</Text> : null}
      <Pressable disabled={creating} style={[styles.buttonDark, creating && styles.disabled]} onPress={createAccount}>
        <Text style={styles.buttonText}>Create an Account</Text>
      </Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Registered accounts</Text>
      {loadError ? <Text style={styles.formError}>Unable to load registered accounts: {loadError}</Text> : null}
      {loading ? <Text style={styles.subtitle}>Loading accounts...</Text> : null}
      {accounts.map((account) => <View style={styles.accountRow} key={account.id}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{account.name}</Text>
          <Text style={styles.subtitle}>{account.email}</Text>
          {account.contactNumber ? <Text style={styles.subtitle}>{account.contactNumber} · {account.address}</Text> : null}
        </View>
        <View style={styles.flex}><Text style={styles.pill}>{roleLabel(account.role)}</Text><Text style={styles.subtitle}>{branches.find((branch) => branch.id === (account.branchId || account.branch_id))?.name || (account.role === 'customer' ? 'Customer' : '')}</Text></View>
        {onToggleAccount && !['admin', 'head_admin', 'customer'].includes(account.role) && <Pressable style={styles.deleteButton} onPress={() => onToggleAccount(account)}><Text style={styles.deleteButtonText}>{account.isActive === false || account.is_active === false ? 'Activate' : 'Deactivate'}</Text></Pressable>}
      </View>)}
      {!loading && !loadError && !accounts.length ? <Text style={styles.subtitle}>No accounts have been registered yet.</Text> : null}
    </View>
  </>;
}

function Header({ eyebrow, title, subtitle }) {
  return <View style={styles.heading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>;
}
function Stat({ label, value, note }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.statNote}>{note}</Text></View>;
}
function AdminOverview({ summary, reportError, onNavigate, branches, selectedBranchId, onSelectBranch, isHeadAdmin }) {
  const topProduct = summary?.topProducts?.[0];
  const pendingValue = reportError ? '—' : 'Loading…';
  const pendingNote = reportError ? 'Live data unavailable' : 'Loading live data';
  return <>
    <Header eyebrow="Operations" title="Overview" subtitle="Live operating metrics and sales reports for your selected branch scope." />
    <View style={styles.stats}>
      <Stat label="Sales" value={summary ? money(summary.sales || 0) : pendingValue} note={summary ? `${summary.orders || 0} orders` : pendingNote} />
      <Stat label="Average order" value={summary ? money(summary.averageOrder || 0) : pendingValue} note={summary ? 'Across selected branches' : pendingNote} />
      <Stat label="Gross profit" value={summary ? money(summary.grossProfit || 0) : pendingValue} note={summary ? `Cost of goods ${money(summary.costOfGoods || 0)}` : pendingNote} />
      <Stat label="Low-stock items" value={summary ? String(summary.lowStock || 0) : pendingValue} note={summary ? `${summary.totalStock || 0} units in stock` : pendingNote} />
      {isHeadAdmin && <>
        <Stat label="Registered users" value={summary ? String(summary.users || 0) : pendingValue} note={summary ? 'All branches · excludes guests' : pendingNote} />
        <Stat label="Top-selling product" value={summary ? topProduct?.name || 'No sales yet' : pendingValue} note={summary ? topProduct ? `${money(topProduct.sales)} in sales` : 'No product sales recorded' : pendingNote} />
      </>}
    </View>
    {reportError ? <View style={styles.notification}><Text style={styles.notificationTitle}>Analytics unavailable</Text><Text style={styles.subtitle}>{reportError}</Text></View> : null}
    <View style={styles.card}><Text style={styles.cardTitle}>Workspace shortcuts</Text><Pressable style={styles.buttonSecondary} onPress={() => onNavigate('branches')}><Text>Manage branches</Text></Pressable><Pressable style={styles.buttonSecondary} onPress={() => onNavigate('team')}><Text>Manage employee accounts</Text></Pressable></View>
    {isHeadAdmin && <AnalyticsCharts summary={summary} />}
    <Reports summary={summary} branches={branches} selectedBranchId={selectedBranchId} onSelectBranch={onSelectBranch} isHeadAdmin={isHeadAdmin} />
  </>;
}
function AnalyticsCharts({ summary }) {
  const stockStatus = summary?.stockStatus || { lowStock: 0, healthy: 0 };
  const salesByDay = summary?.salesByDay || [];
  const topProducts = summary?.topProducts || [];
  const highestProductSales = Math.max(0, ...topProducts.map((product) => Number(product.sales) || 0));
  return <View style={styles.analyticsGrid}>
    <View style={[styles.card, styles.analyticsPanel]}>
      <Text style={styles.cardTitle}>Sales trend</Text>
      <Text style={styles.subtitle}>Daily sales for the last 7 days</Text>
      <SalesBarChart data={salesByDay} />
    </View>
    <View style={[styles.card, styles.analyticsPanel]}>
      <Text style={styles.cardTitle}>Inventory stock health</Text>
      <Text style={styles.subtitle}>Inventory items by stock status</Text>
      <StockPieChart stockStatus={stockStatus} />
    </View>
    <View style={[styles.card, styles.analyticsPanel]}>
      <Text style={styles.cardTitle}>Top products by sales</Text>
      <Text style={styles.subtitle}>Ranked by recorded product revenue</Text>
      {topProducts.length ? topProducts.map((product) => {
        const percentage = highestProductSales ? Math.max(5, Number(product.sales) / highestProductSales * 100) : 0;
        return <View style={styles.productChartRow} key={product.name}>
          <View style={styles.productChartLabel}><Text style={styles.productChartName} numberOfLines={1}>{product.name}</Text><Text style={styles.productChartSales}>{money(product.sales)} · {product.units} sold</Text></View>
          <View style={styles.chartTrack}><View style={[styles.chartFill, { width: `${percentage}%` }]} /></View>
        </View>;
      }) : <Text style={styles.chartEmpty}>No product sales recorded yet.</Text>}
    </View>
  </View>;
}
function SalesBarChart({ data }) {
  if (!data.length) return <Text style={styles.chartEmpty}>No sales data is available yet.</Text>;
  const maxSales = Math.max(1, ...data.map((item) => Number(item.sales) || 0));
  const chartTop = 24;
  const chartBottom = 174;
  const chartHeight = chartBottom - chartTop;
  return <Svg width="100%" height={210} viewBox="0 0 600 210">
    {[0, 0.5, 1].map((fraction) => {
      const y = chartBottom - chartHeight * fraction;
      return <Line key={fraction} x1={42} y1={y} x2={590} y2={y} stroke="#eee6df" strokeWidth={1} />;
    })}
    {data.map((item, index) => {
      const sales = Number(item.sales) || 0;
      const barHeight = sales ? Math.max(3, chartHeight * sales / maxSales) : 0;
      const x = 56 + index * 76;
      return <React.Fragment key={item.date || `${item.day}-${index}`}>
        <Rect x={x} y={chartBottom - barHeight} width={42} height={barHeight} rx={5} fill="#d9683c" />
        <SvgText x={x + 21} y={198} fill="#82766e" fontSize={11} textAnchor="middle">{item.day}</SvgText>
      </React.Fragment>;
    })}
  </Svg>;
}
function pieSlicePath(cx, cy, radius, startAngle, endAngle) {
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}
function StockPieChart({ stockStatus }) {
  const slices = [
    { label: 'Healthy stock', value: stockStatus.healthy, color: '#71815f' },
    { label: 'Low stock', value: stockStatus.lowStock, color: '#d9683c' },
  ].filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return <Text style={styles.chartEmpty}>No inventory data is available yet.</Text>;
  let startAngle = -Math.PI / 2;
  return <View style={styles.stockChart}>
    <Svg width={164} height={164} viewBox="0 0 164 164">
      {slices.length === 1
        ? <Circle cx={82} cy={82} r={72} fill={slices[0].color} />
        : slices.map((slice) => {
          const endAngle = startAngle + 2 * Math.PI * slice.value / total;
          const path = pieSlicePath(82, 82, 72, startAngle, endAngle);
          startAngle = endAngle;
          return <Path key={slice.label} d={path} fill={slice.color} stroke="#fffefa" strokeWidth={2} />;
        })}
    </Svg>
    <View style={styles.stockLegend}>
      <Text style={styles.stockTotal}>{total} items</Text>
      {[
        { label: 'Healthy stock', value: stockStatus.healthy, color: '#71815f' },
        { label: 'Low stock', value: stockStatus.lowStock, color: '#d9683c' },
      ].map((item) => <View style={styles.stockLegendItem} key={item.label}>
        <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
        <Text style={styles.stockLegendText}>{item.label} · {item.value}</Text>
      </View>)}
    </View>
  </View>;
}
function Branches({ branches, selectedBranchId, onSelectBranch, onCreateBranch, onToggleBranch }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canManage = true;
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
    let active = true;
    const refreshLogs = async () => {
      try {
        const data = await requestApi(`/api/admin/audit${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`);
        if (active) {
          setLogs(data);
          setError('');
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load audit logs.');
      }
    };
    refreshLogs();
    const timer = setInterval(refreshLogs, 10000);
    const channel = supabase.channel(`audit-${branchId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, refreshLogs)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && active) console.error('Live activity-log updates are unavailable; periodic refresh remains enabled.');
      });
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel).catch((error) => console.error('Audit subscription cleanup failure:', error.message));
    };
  }, [branchId]);
  return <>
    <Header eyebrow="Administrative oversight" title="Activity log" subtitle="Recent account, branch, inventory, POS, and loyalty actions." />
    <View style={styles.card}>{error ? <Text style={styles.formError}>{error}</Text> : null}
      {logs.length ? logs.map((entry) => <View style={styles.accountRow} key={entry.id}>
        <View style={styles.flex}>
          {entry.action === 'order.completed' ? <>
            <Text style={styles.cardTitle}>Order #{entry.details.orderId} marked {entry.details.statusChangedTo}</Text>
            <Text style={styles.subtitle}>Barista: {entry.details.baristaName || entry.profiles?.full_name || 'Staff'}</Text>
            <Text style={styles.subtitle}>Customer: {entry.details.customerName || 'Walk-in'} · Branch: {entry.details.branchName || 'Branch'}</Text>
          </> : <>
            <Text style={styles.cardTitle}>{entry.action}</Text>
            <Text style={styles.subtitle}>{entry.profiles?.full_name || 'System'} · {entry.entity_type} {entry.entity_id || ''}</Text>
          </>}
          <Text style={styles.subtitle}>{new Date(entry.created_at).toLocaleString()}</Text>
          {entry.action !== 'order.completed' && Object.keys(entry.details || {}).length > 0 && <Text style={styles.auditDetails}>{JSON.stringify(entry.details)}</Text>}
        </View>
        {entry.branch_id && entry.action !== 'order.completed' ? <Text style={styles.pill}>{entry.branch_id.slice(0, 8)}</Text> : null}
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
    const { data, error: insertError } = await supabase.from('rewards').insert({ name: rewardName.trim(), points_required: Number(rewardPoints) }).select().single();
    if (insertError) return setError(insertError.message);
    setRewards((current) => [...current, data]);
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
function Inventory({ branchId, isHeadAdmin, notifications, onDismissNotification, branches: knownBranches }) {
  const [items, setItems] = useState([]);
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
  const reloadRequestId = useRef(0);
  const branches = knownBranches.filter((branch) => branch.is_active !== false);
  const lowStockNotifications = notifications.filter((notification) => notification.title === 'Low stock alert');
  const reload = useCallback(async () => {
    const requestId = ++reloadRequestId.current;
    try {
      const [stock, transferRows, movementRows] = await Promise.all([
        requestApi(`/api/inventory${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
        requestApi('/api/inventory/transfers'),
        requestApi(`/api/inventory/movements${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
      ]);
      if (requestId !== reloadRequestId.current) return;
      setItems(stock); setInventoryId(stock[0]?.id || ''); setTransfers(transferRows); setMovements(movementRows);
    } catch (loadError) {
      if (requestId === reloadRequestId.current) setError(loadError.message || 'Unable to load inventory.');
    } finally {
      if (requestId === reloadRequestId.current) setLoading(false);
    }
  }, [branchId]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) void reload();
    };
    refresh();
    if (!supabase) {
      return () => {
        active = false;
        reloadRequestId.current += 1;
      };
    }
    const channel = supabase.channel(`inventory-${branchId || 'all'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory',
        ...(branchId ? { filter: `branch_id=eq.${branchId}` } : {}),
      }, refresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && active) {
          console.error('Live inventory updates are unavailable; reload the inventory screen to refresh stock.');
        }
      });
    return () => {
      active = false;
      reloadRequestId.current += 1;
      supabase.removeChannel(channel).catch((error) => console.error('Inventory subscription cleanup failure:', error.message));
    };
  }, [branchId, reload]);
  const requestTransfer = async () => {
    const item = items.find((stock) => stock.id === inventoryId);
    const transferQuantity = Number(quantity);
    if (!item || !toBranchId || !Number.isInteger(transferQuantity) || transferQuantity < 1) {
      return setError('Choose an item, destination branch, and a whole-number quantity.');
    }
    if (transferQuantity > item.quantity) return setError(`Only ${item.quantity} units are available at the source branch.`);
    setSaving(true); setError(''); setNotice('');
    try {
      await requestApi('/api/inventory/transfers', { method: 'POST', body: JSON.stringify({ fromBranchId: item.branch_id, toBranchId, items: [{ inventoryId: item.id, quantity: transferQuantity }] }) });
      setNotice(isHeadAdmin ? 'Stock sent to the destination branch.' : 'Transfer request submitted for head-admin approval.');
      await reload();
    } catch (requestError) { setError(requestError.message || 'Unable to request transfer.'); }
    finally { setSaving(false); }
  };
  const reviewTransfer = async (transferId, status) => {
    setError(''); setNotice('');
    try {
      await requestApi(`/api/inventory/transfers/${transferId}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Transfer ${status}.`);
      await reload();
    } catch (reviewError) { setError(reviewError.message || 'Unable to review transfer.'); }
  };
  const adjustStock = async (item, delta) => {
    const nextQuantity = item.quantity + delta;
    if (nextQuantity < 0) return setError('Stock cannot be less than zero.');
    setError(''); setNotice('');
    setItems((current) => current.map((stock) => stock.id === item.id ? { ...stock, quantity: nextQuantity } : stock));
    try {
      await requestApi(`/api/inventory/${item.id}/adjust`, { method: 'POST', body: JSON.stringify({ delta }) });
      void reload();
      setNotice(`${item.name} stock ${delta > 0 ? 'received' : 'adjusted'}.`);
    } catch (adjustError) {
      setItems((current) => current.map((stock) => stock.id === item.id ? { ...stock, quantity: stock.quantity - delta } : stock));
      setError(adjustError.message || 'Unable to adjust stock.');
      void reload();
    }
  };
  const selectedItem = items.find((item) => item.id === inventoryId);
  return <>
    <Header eyebrow="Branch operations" title="Inventory" subtitle="Monitor branch stock, cost, and inter-branch movement." />
    {error ? <Text style={styles.formError}>{error}</Text> : null}{notice ? <Text style={styles.successText}>{notice}</Text> : null}
    {isHeadAdmin && lowStockNotifications.length > 0 && <View style={styles.card}>
      <Text style={styles.cardTitle}>Low-stock alerts · {lowStockNotifications.length}</Text>
      {lowStockNotifications.map((notification) => <View style={styles.notification} key={notification.id}>
        <View style={styles.notificationHeader}><Text style={styles.notificationTitle}>{notification.title}</Text><Pressable onPress={() => onDismissNotification(notification.id)}><Text style={styles.dismissText}>Dismiss</Text></Pressable></View>
        <Text style={styles.subtitle}>{notification.message}</Text>
        <Text style={styles.guestHint}>{new Date(notification.created_at).toLocaleString()}</Text>
      </View>)}
    </View>}
    <View style={styles.stats}><Stat label="Tracked items" value={String(items.length)} note="At selected branches" /><Stat label="Low stock" value={String(items.filter((item) => item.quantity <= item.low_stock_threshold).length)} note="At or below threshold" /><Stat label="Stock value" value={money(items.reduce((sum, item) => sum + Number(item.unit_cost || 0) * item.quantity, 0))} note="Based on recorded cost" /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Stock by branch</Text>{loading ? <Text style={styles.subtitle}>Loading inventory...</Text> : items.map((item) => <View style={styles.accountRow} key={item.id}><View style={styles.flex}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.subtitle}>{item.sku} · {item.branches?.name || branches.find((branch) => branch.id === item.branch_id)?.name || 'Branch stock'}</Text></View><Text style={item.quantity <= item.low_stock_threshold ? styles.warning : styles.price}>{item.quantity} units</Text><View style={styles.quantity}><Pressable onPress={() => adjustStock(item, -1)} style={styles.quantityButton}><Text>-</Text></Pressable><Pressable onPress={() => adjustStock(item, 1)} style={styles.quantityButton}><Text>+</Text></Pressable></View></View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>{isHeadAdmin ? 'Send stock to another branch' : 'Request stock transfer'}</Text>
      <Text style={styles.fieldLabel}>Stock item</Text>
      <View style={styles.roleDropdown}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: stockMenuOpen }} onPress={() => setStockMenuOpen((open) => !open)} style={styles.roleDropdownTrigger}>
          <Text style={styles.roleDropdownValue}>{selectedItem ? `${selectedItem.name} · ${branches.find((branch) => branch.id === selectedItem.branch_id)?.name || 'Source branch'} · ${selectedItem.quantity} available` : 'Select inventory item'}</Text>
          <Text style={styles.roleDropdownChevron}>{stockMenuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {stockMenuOpen && <View style={styles.roleDropdownMenu}>{items.map((item) => <Pressable key={item.id} onPress={() => { setInventoryId(item.id); setStockMenuOpen(false); }} style={[styles.roleDropdownOption, inventoryId === item.id && styles.roleDropdownOptionSelected]}><Text style={[styles.roleDropdownOptionText, inventoryId === item.id && styles.roleDropdownOptionTextSelected]}>{item.name} · {branches.find((branch) => branch.id === item.branch_id)?.name || 'Source branch'} · {item.quantity} available</Text></Pressable>)}</View>}
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
      <Pressable disabled={saving} style={[styles.buttonDark, saving && styles.disabled]} onPress={requestTransfer}><Text style={styles.buttonText}>{saving ? (isHeadAdmin ? 'Sending...' : 'Submitting...') : isHeadAdmin ? 'Send stock' : 'Request transfer'}</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Transfer requests</Text>{transfers.length ? transfers.map((transfer) => <View style={styles.accountRow} key={transfer.id}><View style={styles.flex}><Text style={styles.cardTitle}>{branches.find((branch) => branch.id === transfer.from_branch_id)?.name || 'Source'} → {branches.find((branch) => branch.id === transfer.to_branch_id)?.name || 'Destination'}</Text><Text style={styles.subtitle}>{transfer.status} · {transfer.inventory_transfer_items?.length || 0} item(s)</Text></View>{isHeadAdmin && transfer.status === 'requested' && <View style={styles.queueActions}><Pressable style={styles.smallButton} onPress={() => reviewTransfer(transfer.id, 'approved')}><Text style={styles.buttonText}>Approve</Text></Pressable><Pressable style={styles.deleteButton} onPress={() => reviewTransfer(transfer.id, 'rejected')}><Text style={styles.deleteButtonText}>Reject</Text></Pressable></View>}</View>) : <Text style={styles.subtitle}>No transfer requests.</Text>}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Recent stock movement</Text>{movements.length ? movements.slice(0, 30).map((movement) => <View style={styles.accountRow} key={movement.id}><View style={styles.flex}><Text style={styles.cardTitle}>{movement.inventory?.name || 'Stock item'} · {movement.movement_type.replaceAll('_', ' ')}</Text><Text style={styles.subtitle}>{movement.branches?.name || 'Branch'} · {new Date(movement.created_at).toLocaleString()}</Text></View><Text style={movement.quantity_delta > 0 ? styles.price : styles.warning}>{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</Text></View>) : <Text style={styles.subtitle}>Stock activity will appear here.</Text>}</View>
  </>;
}
function Products({ visibleProducts, search, setSearch, onAdd, checkoutNotice, checkoutError }) {
  return <><Header eyebrow="Cafe menu" title="Menu" subtitle="Choose your favorites and add them to your cart." />{checkoutNotice ? <Text style={styles.successText}>{checkoutNotice}</Text> : null}{checkoutError ? <Text style={styles.formError}>{checkoutError}</Text> : null}<TextInput value={search} onChangeText={setSearch} placeholder="Search coffee, matcha, or pastry" style={styles.input} /><View style={styles.productGrid}>{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</View></>;
}
function ProductCard({ product, onAdd, onDelete }) {
  const isDrink = ['coffee', 'cold', 'matcha'].includes(String(product.category).toLowerCase());
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [size, setSize] = useState('regular');
  const [milk, setMilk] = useState('dairy');
  const [sweetness, setSweetness] = useState(100);
  const [extraEspresso, setExtraEspresso] = useState(false);
  const adjustment = (size === 'large' ? 50 : 0) + (milk === 'oat' ? 35 : 0) + (extraEspresso ? 50 : 0);
  const add = () => {
    onAdd(product, { size, milk, sweetness, extraEspresso });
    setCustomizeOpen(false);
  };
  return <>
    <View style={styles.productCard}>{product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" accessibilityLabel={`${product.name} product photo`} /> : <Text style={styles.productEmoji}>{product.emoji}</Text>}<Text style={styles.eyebrow}>{product.category}</Text><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.subtitle}>{product.description}</Text><View style={styles.cardFooter}><Text style={styles.price}>{money(product.price)}</Text>{onAdd && <Pressable style={styles.button} onPress={() => (isDrink ? setCustomizeOpen(true) : onAdd(product))}><Text style={styles.buttonText}>{isDrink ? 'Customize' : 'Add to order'}</Text></Pressable>}{onDelete && <Pressable style={styles.deleteButton} onPress={() => onDelete(product)}><Text style={styles.deleteButtonText}>Delete</Text></Pressable>}</View></View>
    <Modal visible={customizeOpen} transparent animationType="slide" onRequestClose={() => setCustomizeOpen(false)}>
      <View style={styles.scannerBackdrop}><View style={styles.customizeSheet}>
        <Text style={styles.cardTitle}>Customize {product.name}</Text>
        <Text style={styles.fieldLabel}>Size</Text>
        <View style={styles.optionRow}><OptionChoice label="Regular · included" selected={size === 'regular'} onPress={() => setSize('regular')} /><OptionChoice label="Large · +₱50" selected={size === 'large'} onPress={() => setSize('large')} /></View>
        <Text style={styles.fieldLabel}>Milk</Text>
        <View style={styles.optionRow}><OptionChoice label="Dairy · included" selected={milk === 'dairy'} onPress={() => setMilk('dairy')} /><OptionChoice label="Oat · +₱35" selected={milk === 'oat'} onPress={() => setMilk('oat')} /></View>
        <Text style={styles.fieldLabel}>Sweetness</Text>
        <View style={styles.optionRow}>{[0, 25, 50, 75, 100].map((value) => <OptionChoice key={value} label={`${value}%`} selected={sweetness === value} onPress={() => setSweetness(value)} />)}</View>
        <Text style={styles.fieldLabel}>Extra espresso · +₱50</Text>
        <View style={styles.optionRow}><OptionChoice label="No" selected={!extraEspresso} onPress={() => setExtraEspresso(false)} /><OptionChoice label="Add shot" selected={extraEspresso} onPress={() => setExtraEspresso(true)} /></View>
        <Text style={styles.total}>Price: {money(Number(product.price) + adjustment)}</Text>
        <View style={styles.confirmActions}><Pressable style={styles.confirmCancelButton} onPress={() => setCustomizeOpen(false)}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable><Pressable style={styles.button} onPress={add}><Text style={styles.buttonText}>Add to order</Text></Pressable></View>
      </View></View>
    </Modal>
  </>;
}

function OptionChoice({ label, selected, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.optionChoice, selected && styles.optionChoiceSelected, disabled && styles.disabled]}><Text style={[styles.optionChoiceText, selected && styles.optionChoiceTextSelected]}>{label}</Text></Pressable>;
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
  const productId = (item) => item.productId || item.id;
  const matchesProduct = (promotion, item) => promotion.eligibleProductIds?.length
    ? promotion.eligibleProductIds.includes(productId(item))
    : !promotion.productId || promotion.productId === productId(item);
  const promotion = promotions.find((item) => item.is_active !== false
    && (!item.branchIds?.length || !branchId || item.branchIds.includes(branchId))
    && (!item.starts_at || new Date(item.starts_at).getTime() <= now)
    && (!item.ends_at || new Date(item.ends_at).getTime() > now)
    && cart.some((product) => matchesProduct(item, product)));
  const items = cart.map((item) => ({ ...item }));
  if (!promotion || !items.length) return { items, discountTotal: 0, promotion: null };
  const eligibleItems = items.filter((item) => matchesProduct(promotion, item));
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + (item.price - (item.priceAdjustment || 0)) * item.quantity, 0);
  if (!eligibleItems.length) return { items, discountTotal: 0, promotion: null };
  let discountTotal = 0;
  if (promotion.promoType === 'buy_x_get_y') {
    const quantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
    const freeQuantity = Math.floor(quantity / promotion.buyQuantity) * promotion.getQuantity;
    const freeItem = items.find((item) => productId(item) === promotion.freeProductId)
      || eligibleItems[0];
    if (freeQuantity > 0 && freeItem) items.push({ ...freeItem, id: `promo-${promotion.id}`, name: `${freeItem.name} (Promo)`, price: 0, quantity: freeQuantity, isPromo: true, promoLabel: `Free via ${promotion.title}` });
  } else if (promotion.promoType === 'percentage') {
    discountTotal = Math.round(eligibleSubtotal * Math.min(promotion.discountValue, 100)) / 100;
  } else if (promotion.promoType === 'fixed' || promotion.promoType === 'bundle') {
    discountTotal = Math.min(eligibleSubtotal, promotion.discountValue);
  }
  return { items, discountTotal, promotion };
}

function Pos({ visibleProducts, promotions, branchId, checkoutNotice, checkoutError, search, setSearch, cart, onAdd, onPlaceOrder, onChangeQuantity }) {
  const [customerCode, setCustomerCode] = useState('');
  const [customerInfo, setCustomerInfo] = useState(null);
  const [customerLookupError, setCustomerLookupError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [redemptionNotice, setRedemptionNotice] = useState('');
  const scanHandled = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const preview = previewPromotion(cart, promotions, branchId);
  const lookupCustomer = async (code = customerCode) => {
    if (!code.trim()) { setCustomerInfo(null); setCustomerLookupError(''); return; }
    try {
      const info = await requestApi(`/api/pos/customers/${encodeURIComponent(code.trim())}`);
      if (!info) throw new Error('Customer ID not found.');
      setCustomerInfo(info); setCustomerLookupError('');
    } catch (lookupError) { setCustomerInfo(null); setCustomerLookupError(lookupError.message || 'Customer ID not found.'); }
  };
  const openScanner = async () => {
    setScanError('');
    setRedemptionNotice('');
    scanHandled.current = false;
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return setScanError('Camera access is needed to scan customer QR codes.');
    }
    setScanOpen(true);
  };
  const handleScannedCode = async (rawCode) => {
    if (scanHandled.current) return;
    scanHandled.current = true;
    const code = rawCode.trim();
    setScanOpen(false);
    if (/^CS-/i.test(code)) {
      setCustomerCode(code);
      await lookupCustomer(code);
      return;
    }
    try {
      const result = await requestApi('/api/loyalty/validate-redemption', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setRedemptionNotice(`${result.description} · Reward verified and marked used.`);
    } catch (verificationError) {
      setScanError(verificationError.message || 'Unable to verify reward code.');
    }
  };
  return <>
    <Header eyebrow="Service choreography" title="Point of sale" subtitle="Promotions apply automatically at checkout." />
    <TextInput value={search} onChangeText={setSearch} placeholder="Search menu" style={styles.input} />
    <View style={styles.productGrid}>{visibleProducts.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</View>
    <CartPanel cart={preview.items} discountTotal={preview.discountTotal} promotionLabel={preview.promotion?.title} onChangeQuantity={onChangeQuantity} onPlaceOrder={() => onPlaceOrder(customerCode.trim())} onScanCustomer={openScanner} onCustomerLookup={() => lookupCustomer()} customerInfo={customerInfo} customerLookupError={customerLookupError} buttonLabel="Charge" customerCode={customerCode} setCustomerCode={setCustomerCode} />
    {checkoutNotice ? <Text style={styles.successText}>{checkoutNotice}</Text> : null}
    {checkoutError ? <Text style={styles.formError}>{checkoutError}</Text> : null}
    {redemptionNotice ? <Text style={styles.successText}>{redemptionNotice}</Text> : null}
    {scanError ? <Text style={styles.formError}>{scanError}</Text> : null}
    <Modal visible={scanOpen} transparent animationType="slide" onRequestClose={() => setScanOpen(false)}>
      <View style={styles.scannerBackdrop}><View style={styles.scannerSheet}>
        <Text style={styles.cardTitle}>Scan customer QR</Text>
        <CameraView style={styles.scanCamera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => handleScannedCode(data)} />
        <Pressable style={styles.buttonSecondary} onPress={() => setScanOpen(false)}><Text>Cancel</Text></Pressable>
      </View></View>
    </Modal>
  </>;
}
function createPickupSlots() {
  const interval = 15 * 60 * 1000;
  const now = Date.now();
  const firstSlot = Math.ceil((now + 60 * 1000) / interval) * interval;
  const lastSlot = now + 2 * 60 * 60 * 1000;
  const slots = [];
  for (let timestamp = firstSlot; timestamp <= lastSlot; timestamp += interval) {
    slots.push({
      value: new Date(timestamp).toISOString(),
      label: new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    });
  }
  return slots;
}

function pickupLabel(order) {
  const pickupAt = order.scheduled_pickup_at || order.estimated_pickup_at;
  if (!pickupAt) return '';
  const time = new Date(pickupAt);
  return `${order.scheduled_pickup_at ? 'Scheduled pickup' : 'Estimated pickup'} · ${time.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

function CartPanel({ cart, onChangeQuantity, onPlaceOrder, buttonLabel = 'Place pickup order', discountTotal = 0, promotionLabel, customerCode, setCustomerCode, onScanCustomer, onCustomerLookup, customerInfo, customerLookupError, schedulePickup = false, customerPayment = false, availablePoints = 0, promotions = [], branchId }) {
  const [pickupAt, setPickupAt] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('fake_money');
  const pickupSlots = createPickupSlots();
  const customerPreview = customerPayment ? previewPromotion(cart, promotions, branchId) : null;
  const displayCart = customerPreview?.items || cart;
  const subtotal = displayCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const appliedDiscount = customerPreview?.discountTotal ?? discountTotal;
  const appliedPromotion = customerPreview?.promotion?.title || promotionLabel;
  const total = Math.max(0, subtotal - appliedDiscount);
  const pointsRequired = Math.ceil(total);
  const canPayWithPoints = availablePoints >= pointsRequired;
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</Text>
    {setCustomerCode && <View style={styles.customerIdRow}><TextInput value={customerCode} onChangeText={setCustomerCode} onBlur={onCustomerLookup} placeholder="Customer ID (optional)" autoCapitalize="characters" style={[styles.input, styles.customerIdInput]} />{onScanCustomer && <Pressable style={styles.smallButton} onPress={onScanCustomer}><Text style={styles.buttonText}>Scan QR</Text></Pressable>}</View>}
    {customerInfo && <Text style={styles.successText}>{customerInfo.full_name} · {customerInfo.reward_points} points</Text>}
    {customerLookupError ? <Text style={styles.formError}>{customerLookupError}</Text> : null}
    {cart.length ? displayCart.map((item) => <View style={styles.cartRow} key={item.id}>
      <View><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.subtitle}>{item.promoLabel || `${money(item.price)} each${item.customization ? ` · ${item.customization.size === 'large' ? 'Large' : 'Regular'}, ${item.customization.milk === 'oat' ? 'Oat milk' : 'Dairy'}, ${item.customization.sweetness}% sweet${item.customization.extraEspresso ? ', extra shot' : ''}` : ''}`}</Text></View>
      <View style={styles.cartLineFooter}>{!item.isPromo && <View style={styles.quantity}><Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${item.name}`} onPress={() => onChangeQuantity(item.id, -1)} style={styles.quantityButton}><Text>-</Text></Pressable><Text>{item.quantity}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Add one ${item.name}`} onPress={() => onChangeQuantity(item.id, 1)} style={styles.quantityButton}><Text>+</Text></Pressable></View>}<Text style={styles.price}>{money(item.price * item.quantity)}</Text></View>
    </View>) : <Text style={styles.subtitle}>Your cart is empty. Tap Add to order to get started.</Text>}
    {appliedPromotion ? <Text style={styles.successText}>Promotion applied: {appliedPromotion}</Text> : null}
    {appliedDiscount > 0 && <Text style={styles.promoPrice}>Discount: -{money(appliedDiscount)}</Text>}
    {schedulePickup && <View style={styles.pickupSchedule}>
      <Text style={styles.fieldLabel}>Pickup time</Text>
      <Text style={styles.subtitle}>Choose ASAP or a 15-minute slot within the next 2 hours.</Text>
      <View style={styles.optionRow}>
        <OptionChoice label="ASAP · ~20 min" selected={!pickupAt} onPress={() => setPickupAt('')} />
        {pickupSlots.map((slot) => <OptionChoice key={slot.value} label={slot.label} selected={pickupAt === slot.value} onPress={() => setPickupAt(slot.value)} />)}
      </View>
    </View>}
    <View style={styles.cartSubtotalRow}><Text style={styles.subtitle}>Subtotal</Text><Text style={styles.price}>{money(subtotal)}</Text></View>
    {appliedDiscount > 0 && <View style={styles.cartSubtotalRow}><Text style={styles.subtitle}>Discount</Text><Text style={styles.price}>−{money(appliedDiscount)}</Text></View>}
    <Text style={styles.total}>Total: {money(total)}</Text>
    {customerPayment && <>
      <Text style={styles.fieldLabel}>Payment method</Text>
      <View style={styles.optionRow}>
        <OptionChoice label="Simulated money" selected={paymentMethod === 'fake_money'} onPress={() => setPaymentMethod('fake_money')} />
        <OptionChoice label="Points" selected={paymentMethod === 'points'} disabled={!canPayWithPoints} onPress={() => setPaymentMethod('points')} />
      </View>
      <Text style={canPayWithPoints ? styles.subtitle : styles.formError}>Your points: {availablePoints} · Needed: {pointsRequired} (₱1 = 1 point){canPayWithPoints ? '' : ' · Not enough points for this order'}</Text>
      {paymentMethod === 'fake_money' && <Text style={styles.subtitle}>Simulated payment only; no real money is charged.</Text>}
    </>}
    <Pressable disabled={!cart.length || (customerPayment && paymentMethod === 'points' && !canPayWithPoints)} style={[styles.buttonDark, (!cart.length || (customerPayment && paymentMethod === 'points' && !canPayWithPoints)) && styles.disabled]} onPress={() => onPlaceOrder(schedulePickup ? pickupAt || null : undefined, paymentMethod)}><Text style={styles.buttonText}>{buttonLabel} {money(total)}</Text></Pressable>
  </View>;
}
function Queue({ orders, onUpdateStatus, loadError, statusError, onRetry }) {
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const sortedOrders = [...orders].sort((left, right) => {
    const leftTime = new Date(left.scheduled_pickup_at || left.estimated_pickup_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.scheduled_pickup_at || right.estimated_pickup_at || right.created_at || 0).getTime();
    return leftTime - rightTime;
  });
  const upcomingOrders = sortedOrders.filter((order) => !['Completed', 'Cancelled'].includes(order.status));
  const customerGroups = sortedOrders.reduce((groups, order) => {
    const customerKey = order.customer_id || order.customerId || order.customerEmail || order.customer_email
      || (order.customer && order.customer !== 'Walk-in' ? order.customer : `walk-in-${order.id}`);
    const group = groups.find((item) => item.key === customerKey);
    if (group) group.orders.push(order);
    else groups.push({ key: customerKey, name: order.customer || 'Walk-in', orders: [order] });
    return groups;
  }, []);
  return <>
    <Header eyebrow="Service choreography" title="Order queue" subtitle="Tap a customer name to expand their orders. Orders are sorted by pickup time." />
    {loadError ? <View style={styles.formError}><Text>Unable to sync orders: {loadError}</Text><Pressable style={styles.buttonSecondary} onPress={onRetry}><Text>Retry</Text></Pressable></View> : null}
    {statusError ? <Text style={styles.formError}>Unable to update order: {statusError}</Text> : null}
    {upcomingOrders.length > 0 && <View style={styles.card}><Text style={styles.cardTitle}>Upcoming pickups</Text>{upcomingOrders.slice(0, 8).map((order) => <Text key={`pickup-${order.id}`} style={styles.subtitle}>{pickupLabel(order) || 'Pickup time pending'} · #{order.id} · {order.customer}</Text>)}</View>}
    {customerGroups.length ? customerGroups.map((group) => {
      const isExpanded = expandedCustomer === group.key;
      const activeOrders = group.orders.filter((order) => !['Completed', 'Cancelled'].includes(order.status)).length;
      return <View style={styles.queueCustomerGroup} key={group.key}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => setExpandedCustomer(isExpanded ? null : group.key)}
          style={styles.queueCustomerHeader}
        >
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{group.name}</Text>
            <Text style={styles.subtitle}>{group.orders.length} order{group.orders.length === 1 ? '' : 's'} · {activeOrders} active</Text>
          </View>
          <Text style={styles.roleDropdownChevron}>{isExpanded ? '▲' : '▼'}</Text>
        </Pressable>
        {isExpanded && <View style={styles.queueCustomerOrders}>
          {group.orders.map((order) => <View style={styles.queueOrder} key={order.id}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Order #{order.id}</Text>
              <Text style={styles.subtitle}>{order.items} · {order.channel}</Text>
              {pickupLabel(order) ? <Text style={styles.successText}>{pickupLabel(order)}</Text> : null}
            </View>
            <View style={styles.queueActions}><Text style={styles.pill}>{order.status}</Text>
              {order.status === 'New' && <Pressable style={styles.smallButton} onPress={() => onUpdateStatus(order.id, 'Preparing')}><Text style={styles.buttonText}>Start preparing</Text></Pressable>}
              {order.status === 'Preparing' && <Pressable style={styles.smallButton} onPress={() => onUpdateStatus(order.id, 'Ready for pickup')}><Text style={styles.buttonText}>Mark ready</Text></Pressable>}
              {order.status === 'Ready for pickup' && <Pressable style={styles.smallButton} onPress={() => onUpdateStatus(order.id, 'Completed')}><Text style={styles.buttonText}>Complete pickup</Text></Pressable>}
            </View>
          </View>)}
        </View>}
      </View>;
    }) : <Text style={styles.subtitle}>No orders are waiting in the queue.</Text>}
  </>;
}
function Receipts({ orders }) {
  return <><Header eyebrow="Service history" title="Receipts" subtitle="Recent counter and online orders." />{orders.map((order) => <View style={styles.listCard} key={order.id}><View style={styles.flex}><Text style={styles.cardTitle}>#{order.id}</Text><Text style={styles.subtitle}>{order.customer} · {order.items}</Text>{order.promotionTitle && <Text style={styles.successText}>Promotion: {order.promotionTitle}</Text>}{Number(order.discount_total || order.discountTotal || 0) > 0 && <Text style={styles.warning}>Discount: -{money(order.discount_total || order.discountTotal)}</Text>}</View><Text style={styles.price}>{money(order.total)}</Text></View>)}</>;
}
function Reports({ summary, branches, selectedBranchId, onSelectBranch, isHeadAdmin }) {
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const pendingValue = '—';
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
      <Stat label="Gross sales" value={summary ? money(summary.sales || 0) : pendingValue} note={`${summary?.orders || 0} orders`} />
      <Stat label="Average order" value={summary ? money(summary.averageOrder || 0) : pendingValue} note="Per completed sale" />
      <Stat label="Customers" value={summary ? String(summary.customers || 0) : pendingValue} note="Unique customers" />
      <Stat label="Low stock" value={summary ? String(summary.lowStock || 0) : pendingValue} note="Threshold alerts" />
      <Stat label="Inventory value" value={summary ? money(summary.inventoryValue || 0) : pendingValue} note="At recorded unit cost" />
      <Stat label="Cost of goods" value={summary ? money(summary.costOfGoods || 0) : pendingValue} note="Based on product cost" />
      <Stat label="Gross profit" value={summary ? money(summary.grossProfit || 0) : pendingValue} note="Sales less cost of goods" />
    </View>
  </>;
}
function CustomerHome({ products, promotions, branchId, branches, checkoutNotice, checkoutError, user, orders, notifications, dismissedPromoKey, onDismissNotification, onDismissPromotion, onNavigate, onAdd }) {
  const customerOrders = orders.filter((order) => order.customerId === user.id || order.customer_id === user.id || (user.email && order.customerEmail === user.email));
  const readyOrder = customerOrders.find((order) => order.status === 'Ready for pickup');
  const activeOrder = customerOrders.find((order) => !['Completed', 'Cancelled'].includes(order.status));
  const readyNotification = notifications.find((notification) => notification.title?.toLowerCase().includes('ready'));
  const currentTime = Date.now();
  const activePromotion = promotions.find((promotion) => promotion.is_active !== false
    && (!promotion.branchIds?.length || promotion.branchIds.includes(branchId))
    && (!promotion.starts_at || new Date(promotion.starts_at).getTime() <= currentTime)
    && (!promotion.ends_at || new Date(promotion.ends_at).getTime() > currentTime));
  const promotedProduct = activePromotion && products.find((product) => product.id === activePromotion.productId);
  const promoKey = activePromotion ? `${user.id}:${activePromotion.id}` : '';
  const promoDismissed = dismissedPromoKey === promoKey;
  const customerProducts = products.filter((product) => product.category !== 'Inventory');
  const branchName = branches.find((branch) => branch.id === branchId)?.name;
  return <>
    <Header eyebrow={`360 Degrees Specialty Cafe${branchName ? ` · ${branchName}` : ''}`} title={`Welcome, ${user.name}.`} subtitle="Your neighborhood coffee, ready when you are." />
    {checkoutNotice ? <Text style={styles.successText}>{checkoutNotice}</Text> : null}
    {checkoutError ? <Text style={styles.formError}>{checkoutError}</Text> : null}
    {user.customerCode && <View style={styles.customerIdCard}><QRCode value={user.customerCode} size={108} /><View style={styles.flex}><Text style={styles.eyebrow}>{user.role === 'guest' ? 'Guest ID' : 'Customer ID'}</Text><Text style={styles.customerId}>{user.customerCode}</Text><Text style={styles.subtitle}>{user.role === 'guest' ? 'Temporary account · guest orders do not earn or redeem loyalty points.' : 'Show this code at checkout to earn points.'}</Text>{user.role === 'guest' && user.guestExpiresAt ? <Text style={styles.guestHint}>Expires {new Date(user.guestExpiresAt).toLocaleString()}</Text> : null}</View></View>}
    {(readyOrder || readyNotification) && <View style={styles.notification}><View style={styles.notificationHeader}><Text style={styles.notificationTitle}>Your order is ready for pickup</Text>{readyNotification && <Pressable onPress={() => onDismissNotification(readyNotification.id)}><Text style={styles.dismissText}>Dismiss</Text></Pressable>}</View><Text style={styles.subtitle}>{readyNotification?.message || `Order #${readyOrder.id} is ready at ${branchName}.`}</Text></View>}
    {activeOrder && <View style={styles.card}><Text style={styles.cardTitle}>Order tracking · #{activeOrder.id}</Text><Text style={styles.pill}>{activeOrder.status}</Text>{pickupLabel(activeOrder) ? <Text style={styles.successText}>{pickupLabel(activeOrder)}</Text> : null}<Text style={styles.subtitle}>{activeOrder.items}</Text><Pressable style={styles.buttonSecondary} onPress={() => onNavigate('orders')}><Text>View order details</Text></Pressable></View>}
    {notifications.filter((notification) => !notification.title?.toLowerCase().includes('ready')).slice(0, 3).map((notification) => <View style={styles.notification} key={notification.id}><View style={styles.notificationHeader}><Text style={styles.notificationTitle}>{notification.title}</Text><Pressable onPress={() => onDismissNotification(notification.id)}><Text style={styles.dismissText}>Dismiss</Text></Pressable></View><Text style={styles.subtitle}>{notification.message}</Text></View>)}
    {activePromotion && !promoDismissed && <View style={styles.promo}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss promotion" onPress={() => onDismissPromotion(promoKey)} style={styles.promoDismissButton}>
        <Text style={styles.promoDismissText}>×</Text>
      </Pressable>
      <Text style={styles.eyebrow}>Featured promotion</Text>
      <Text style={styles.promoTitle}>{activePromotion.title}</Text>
      {activePromotion.description ? <Text style={styles.subtitle}>{activePromotion.description}</Text> : null}
      {promotedProduct && <Text style={styles.promoPrice}>{promotedProduct.name} · {money(promotedProduct.price)}</Text>}
      <Pressable style={styles.button} onPress={() => {
        promotedProduct ? onAdd(promotedProduct) : onNavigate('menu');
      }}>
        <Text style={styles.buttonText}>{promotedProduct ? `Order ${promotedProduct.name}` : 'See menu'}</Text>
      </Pressable>
    </View>}
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Picked for you</Text>
      {customerProducts.length ? customerProducts.slice(0, 3).map((product) => <Pressable style={styles.listRow} key={product.id} onPress={() => onAdd(product)}><Text>{product.emoji} {product.name}</Text><Text style={styles.price}>{money(product.price)}</Text></Pressable>) : <Text style={styles.subtitle}>Menu items are currently unavailable.</Text>}
      <Pressable style={styles.buttonSecondary} onPress={() => onNavigate('menu')}><Text>See menu</Text></Pressable>
    </View>
  </>;
}
function Orders({ orders, user }) {
  const customerOrders = orders.filter((order) => order.customerId === user.id || order.customer_id === user.id || (user.email && order.customerEmail === user.email));
  return <><Header eyebrow="Customer workspace" title="My orders" subtitle="Track order preparation and pickup times." />{customerOrders.length ? customerOrders.map((order) => <View style={styles.listCard} key={order.id}><View style={styles.flex}><Text style={styles.cardTitle}>#{order.id}</Text><Text style={styles.subtitle}>{order.items}</Text>{pickupLabel(order) ? <Text style={styles.successText}>{pickupLabel(order)}</Text> : null}</View><View><Text style={styles.pill}>{order.status}</Text><Text style={styles.price}>{money(order.total)}</Text></View></View>) : <Text style={styles.subtitle}>Your orders will appear here after checkout.</Text>}</>;
}
function Wallet({ user, onRedeem }) {
  const [points, setPoints] = useState(user.rewardPoints || 0);
  const [history, setHistory] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [redeemingId, setRedeemingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!supabase || !user.id) return;
    let active = true;
    Promise.all([
      supabase.from('reward_transactions').select('id,points,description,transaction_type,created_at,expires_at,redemption_code,redeemed_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('rewards').select('id,name,description,points_required').eq('is_active', true).order('points_required'),
    ]).then(([historyResult, rewardsResult]) => {
      if (!active) return;
      const lookupError = historyResult.error || rewardsResult.error;
      if (lookupError) {
        setLoadError(lookupError.message || 'Unable to load loyalty information.');
        return;
      }
      setLoadError('');
      setHistory(historyResult.data);
      const availablePoints = historyResult.data.reduce((total, transaction) => {
        const expiredEarn = transaction.transaction_type === 'earned' && transaction.expires_at && new Date(transaction.expires_at).getTime() <= Date.now();
        if (expiredEarn || transaction.transaction_type === 'expired') return total;
        return total + Number(transaction.points);
      }, 0);
      setPoints(Math.max(0, availablePoints));
      setRewards(rewardsResult.data);
    }).catch((lookupError) => {
      console.error('Loyalty lookup failure:', lookupError.message);
      if (active) setLoadError(lookupError.message || 'Unable to load loyalty information.');
    });
    return () => { active = false; };
  }, [user.id]);
  const redeem = async (reward) => {
    setRedeemingId(reward.id); setError(''); setMessage('');
    try {
      const result = await onRedeem(reward.id);
      setPoints(result.pointsBalance);
      setHistory((current) => [{
        id: result.redemptionCode,
        points: -reward.points_required,
        description: `Redeemed: ${reward.name}`,
        transaction_type: 'redeemed',
        created_at: new Date().toISOString(),
        redemption_code: result.redemptionCode,
      }, ...current]);
      setMessage(`${reward.name} redeemed.`);
    } catch (redeemError) { setError(redeemError.message || 'Unable to redeem reward.'); }
    finally { setRedeemingId(''); }
  };
  const nextReward = rewards.find((reward) => reward.points_required > points);
  const pointsUntilReward = nextReward ? nextReward.points_required - points : 0;
  const progressPercent = nextReward ? Math.min(100, Math.round(points / nextReward.points_required * 100)) : (rewards.length ? 100 : 0);
  return <>
    <Header eyebrow="360 rewards" title="Wallet & rewards" subtitle="Your points and reward history." />
    {user.customerCode && <View style={styles.customerIdCard}><QRCode value={user.customerCode} size={96} /><View style={styles.flex}><Text style={styles.eyebrow}>Customer ID</Text><Text style={styles.customerId}>{user.customerCode}</Text></View></View>}
    <View style={styles.reward}><Text style={styles.eyebrow}>360 REWARDS</Text><Text style={styles.rewardPoints}>{points} points</Text><Text style={styles.subtitle}>{nextReward ? `${pointsUntilReward} points to ${nextReward.name}` : rewards.length ? 'You can redeem an available reward' : 'Earn points with every eligible purchase'}</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View></View>
    {loadError ? <Text style={styles.formError}>{loadError}</Text> : null}
    <View style={styles.card}><Text style={styles.cardTitle}>Rewards</Text>{rewards.length ? rewards.map((reward) => <View style={styles.listCard} key={reward.id}><View style={styles.flex}><Text style={styles.cardTitle}>{reward.name}</Text><Text style={styles.subtitle}>{reward.description}</Text></View><View><Text style={styles.pill}>{reward.points_required} points</Text><Text style={styles.subtitle}>{points >= reward.points_required ? 'Eligible now' : `${reward.points_required - points} more points needed`}</Text><Pressable disabled={points < reward.points_required || redeemingId === reward.id} style={[styles.smallButton, (points < reward.points_required || redeemingId === reward.id) && styles.disabled]} onPress={() => redeem(reward)}><Text style={styles.buttonText}>{redeemingId === reward.id ? 'Redeeming...' : 'Redeem'}</Text></Pressable></View></View>) : <Text style={styles.subtitle}>Rewards will appear here when available.</Text>}{message ? <Text style={styles.successText}>{message}</Text> : null}{error ? <Text style={styles.formError}>{error}</Text> : null}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Points history</Text>{history.length ? history.map((transaction) => <View style={styles.accountRow} key={transaction.id || `${transaction.created_at}-${transaction.description}`}><View style={styles.flex}><Text style={styles.cardTitle}>{transaction.description}</Text><Text style={styles.subtitle}>{new Date(transaction.created_at).toLocaleDateString()}{transaction.expires_at ? ` · Expires ${new Date(transaction.expires_at).toLocaleDateString()}` : ''}</Text>{transaction.redemption_code && <View style={styles.redemptionCode}>{!transaction.redeemed_at && <QRCode value={transaction.redemption_code} size={78} />}<View style={styles.flex}><Text style={styles.fieldLabel}>{transaction.redeemed_at ? 'Redeemed at counter' : 'Show cashier to redeem'}</Text><Text style={styles.customerId}>{transaction.redemption_code}</Text></View></View>}</View><Text style={styles.price}>{transaction.points > 0 ? '+' : ''}{transaction.points}</Text></View>) : <Text style={styles.subtitle}>Your points activity will appear here.</Text>}</View>
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
  const [profileNotice, setProfileNotice] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveProfile = async () => {
    if (name.trim().length < 2) return setProfileError('Enter your full name.');
    if (!contactNumber.trim()) return setProfileError('Enter a contact number.');
    setSavingProfile(true);
    setProfileError('');
    setProfileNotice('');
    try {
      await onSaveProfile({ fullName: name.trim(), contactNumber: contactNumber.trim(), address: address.trim() });
      setProfileNotice('Your account details have been saved.');
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
    setPasswordNotice('');
    try {
      await onChangePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Your password has been updated.');
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
      {profileNotice ? <Text accessibilityLiveRegion="polite" style={styles.successText}>{profileNotice}</Text> : null}
      <Pressable disabled={savingProfile} style={[styles.buttonDark, savingProfile && styles.disabled]} onPress={saveProfile}>
        <Text style={styles.buttonText}>{savingProfile ? 'Saving...' : 'Save profile'}</Text>
      </Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Change password</Text>
      <PasswordInput value={newPassword} onChangeText={setNewPassword} placeholder="New password (8+ characters)" visible={showNewPassword} onToggle={() => setShowNewPassword((visible) => !visible)} />
      <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} />
      {passwordError ? <Text style={styles.formError}>{passwordError}</Text> : null}
      {passwordNotice ? <Text accessibilityLiveRegion="polite" style={styles.successText}>{passwordNotice}</Text> : null}
      <Pressable disabled={savingPassword} style={[styles.buttonDark, savingPassword && styles.disabled]} onPress={savePassword}>
        <Text style={styles.buttonText}>{savingPassword ? 'Saving...' : 'Update password'}</Text>
      </Pressable>
    </View>
  </>;
}

const baseStyles = StyleSheet.create({
  textInputDefaults: { color: '#30251f' },
  safeArea: { flex: 1, backgroundColor: '#fbf8f3' },
  authRoot: { flex: 1, backgroundColor: '#33241e', position: 'relative' },
  authBackgroundImage: { width: '100%', height: '100%', opacity: 0.42 },
  authBackgroundTint: { backgroundColor: 'rgba(24, 14, 10, 0.62)' },
  authSafeArea: { flex: 1, backgroundColor: 'transparent' },
  authKeyboardAvoiding: { flex: 1 },
  authPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  authPageCompact: { padding: 14 },
  authCard: { width: '100%', maxWidth: 460, backgroundColor: 'rgba(255, 254, 250, 0.95)', borderRadius: 18, padding: 28 },
  authCardCompact: { padding: 20, borderRadius: 16 },
  authBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  authBrandDetails: { flex: 1, minWidth: 0 },
  brandLogoImage: { aspectRatio: 1 },
  authTabs: { flexDirection: 'row', backgroundColor: '#f3eee8', borderRadius: 9, padding: 4, marginBottom: 20 },
  authTab: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 7 },
  authTabActive: { backgroundColor: '#d9683c' },
  authTabText: { color: '#82766e', fontSize: 13, fontWeight: '700' },
  authTabTextActive: { color: '#fff' },
  brandNameDark: { color: '#30251f', fontFamily: 'Georgia', fontSize: 16, maxWidth: 180 },
  authTitle: { color: '#30251f', fontFamily: 'Georgia', fontSize: 30, marginTop: 7, marginBottom: 8 },
  authTitleCompact: { fontSize: 26 },
  authSubtitle: { color: '#82766e', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  authSubtitleCompact: { marginBottom: 14 },
  authInput: { minHeight: 48, color: '#30251f', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 9, paddingHorizontal: 14, marginBottom: 12, fontSize: 14 },
  authFieldLabel: { color: '#4b3b32', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  authInputEmphasized: { backgroundColor: '#fffefa', borderColor: '#8b776a', borderWidth: 1.5 },
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
  passwordInputWrapperEmphasized: { backgroundColor: '#fffefa', borderColor: '#8b776a', borderWidth: 1.5 },
  passwordInput: { flex: 1, minHeight: 46, color: '#30251f', paddingHorizontal: 14, fontSize: 14 },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 13 },
  passwordToggleText: { color: '#b94f2b', fontSize: 12, fontWeight: '700' },
  authButton: { backgroundColor: '#d9683c', padding: 14, borderRadius: 9, alignItems: 'center', marginTop: 6 },
  guestButton: { borderWidth: 1, borderColor: '#e9e0d7', padding: 12, borderRadius: 9, alignItems: 'center', marginTop: 12 },
  guestButtonText: { color: '#5f4031', fontSize: 13, fontWeight: '700' },
  guestHint: { color: '#82766e', fontSize: 10, marginTop: 5 },
  authSwitch: { alignItems: 'center', padding: 14 },
  authSwitchText: { color: '#b94f2b', fontSize: 13, fontWeight: '700' },
  formError: { color: '#b33c2f', fontSize: 12, marginBottom: 8 },
  successText: { color: '#596849', fontSize: 12, marginTop: 8 },
  auditDetails: { color: '#82766e', fontSize: 10, marginTop: 4 },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', paddingVertical: 12 },
  branchRowActive: { backgroundColor: '#f5ece6' },
  app: { flex: 1, flexDirection: 'row', position: 'relative' },
  appMobile: { flexDirection: 'column' },
  accountBackgroundImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', opacity: 0.3 },
  sidebar: { width: 246, backgroundColor: '#33241e', padding: 20, minHeight: '100%' },
  drawerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 8, backgroundColor: 'rgba(20, 13, 10, 0.58)' },
  drawerBackdropPressable: { flex: 1 },
  sidebarMobile: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 10, minHeight: 0, padding: 18, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 8, height: 0 }, elevation: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 },
  brandDetails: { flex: 1 },
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
  main: { flex: 1, minWidth: 0, position: 'relative' },
  topbar: { minHeight: 70, padding: 16, borderBottomWidth: 1, borderBottomColor: '#e9e0d7', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  topbarMobile: { alignItems: 'flex-start', flexWrap: 'wrap' },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileHeader: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#33241e', flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#402e26' },
  menuIcon: { color: '#fff', fontSize: 23, lineHeight: 25 },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mobileBrandName: { color: '#fff', fontFamily: 'Georgia', fontSize: 14 },
  mobileBranch: { color: '#b9a99f', fontSize: 8, letterSpacing: 1.5, marginTop: 2 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#402e26' },
  closeIcon: { color: '#fff', fontSize: 25, lineHeight: 27 },
  breadcrumb: { color: '#82766e', fontSize: 12, flexShrink: 1 },
  location: { color: '#5e5149', fontSize: 11, borderWidth: 1, borderColor: '#e9e0d7', padding: 9, borderRadius: 8 },
  topbarSignOut: { color: '#b94f2b', fontSize: 11, fontWeight: '700' },
  content: { padding: 28, maxWidth: 1440, width: '100%' },
  contentMobile: { padding: 16 },
  contentWithCart: { paddingBottom: 100 },
  captureScroll: { flex: 1 },
  captureContent: { flexGrow: 1, width: '100%', maxWidth: '100%', padding: 0 },
  heading: { marginBottom: 22 },
  eyebrow: { color: '#b94f2b', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: '#30251f', fontFamily: 'Georgia', fontSize: 34, marginTop: 7, marginBottom: 6 },
  subtitle: { color: '#82766e', fontSize: 12, lineHeight: 19 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  stat: { flexGrow: 1, flexBasis: 170, minHeight: 110, padding: 17, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 14 },
  statLabel: { color: '#82766e', fontSize: 11 },
  statValue: { color: '#30251f', fontSize: 24, fontWeight: '700', marginTop: 13 },
  statNote: { color: '#71815f', fontSize: 10, marginTop: 5 },
  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  analyticsPanel: { flexGrow: 1, flexBasis: 340, marginBottom: 0 },
  chartEmpty: { color: '#82766e', fontSize: 12, paddingVertical: 28, textAlign: 'center' },
  stockChart: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12 },
  stockLegend: { gap: 10 },
  stockTotal: { color: '#30251f', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  stockLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  stockLegendText: { color: '#82766e', fontSize: 11 },
  productChartRow: { marginTop: 16 },
  productChartLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 7 },
  productChartName: { flex: 1, color: '#30251f', fontSize: 12, fontWeight: '600' },
  productChartSales: { color: '#82766e', fontSize: 10 },
  chartTrack: { height: 8, backgroundColor: '#f0ebe5', borderRadius: 5, overflow: 'hidden' },
  chartFill: { height: 8, backgroundColor: '#d9683c', borderRadius: 5 },
  card: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 14, padding: 20, marginBottom: 16 },
  cardTitle: { color: '#30251f', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  forecastTitle: { color: '#fff', backgroundColor: '#33241e', padding: 16, fontFamily: 'Georgia', fontSize: 20, marginVertical: 12, borderRadius: 10 },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 12, padding: 15, marginBottom: 10 },
  queueCustomerGroup: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  queueCustomerHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  queueCustomerOrders: { paddingHorizontal: 14, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#f0ebe5' },
  queueOrder: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f0ebe5' },
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
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  optionChoice: { borderWidth: 1, borderColor: '#e9e0d7', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fff' },
  optionChoiceSelected: { backgroundColor: '#f5ece6', borderColor: '#d9683c' },
  optionChoiceText: { color: '#5e5149', fontSize: 11 },
  optionChoiceTextSelected: { color: '#b94f2b', fontWeight: '700' },
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
  cartRow: { gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', paddingVertical: 12 },
  cartLineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  cartSubtotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0ebe5', paddingVertical: 12 },
  quantity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3eee8', borderRadius: 20 },
  queueActions: { alignItems: 'flex-end', gap: 8 },
  smallButton: { backgroundColor: '#d9683c', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7 },
  notification: { backgroundColor: '#e7eddf', borderWidth: 1, borderColor: '#bdcdb0', borderRadius: 12, padding: 16, marginBottom: 16 },
  notificationHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  dismissText: { color: '#596849', fontSize: 11, fontWeight: '700' },
  pickupSchedule: { backgroundColor: '#fbf8f3', borderRadius: 9, padding: 12, marginTop: 12 },
  redemptionCode: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, marginTop: 8, backgroundColor: '#fff', borderRadius: 8 },
  customerIdCard: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e9e0d7', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 },
  customerId: { color: '#30251f', fontSize: 16, fontWeight: '700', marginVertical: 5 },
  cartFeedback: { position: 'absolute', right: 20, width: '90%', maxWidth: 360, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#bdcdb0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8, zIndex: 6 },
  cartFeedbackCheck: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#71815f', alignItems: 'center', justifyContent: 'center' },
  cartFeedbackCheckText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cartFeedbackCopy: { flex: 1, minWidth: 0 },
  cartFeedbackTitle: { color: '#596849', fontSize: 12, fontWeight: '700' },
  cartFeedbackName: { color: '#30251f', fontSize: 12, marginTop: 2 },
  cartFloatingButton: { position: 'absolute', right: 20, bottom: 18, zIndex: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  cartFloatingPressable: { minHeight: 52, minWidth: 126, backgroundColor: '#33241e', borderRadius: 28, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  cartFloatingText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cartModalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12, backgroundColor: 'rgba(20, 13, 10, 0.62)' },
  cartModalSheet: { width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: '#fbf8f3', borderRadius: 18, padding: 14 },
  cartModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  closeButtonLight: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#f0e9e1' },
  closeIconLight: { color: '#5e5149', fontSize: 26, lineHeight: 28 },
  customerIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerIdInput: { flex: 1, marginBottom: 0 },
  scannerBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(20, 13, 10, 0.65)' },
  scannerSheet: { backgroundColor: '#fffefa', borderRadius: 12, padding: 16 },
  customizeSheet: { backgroundColor: '#fffefa', borderRadius: 12, padding: 18, maxHeight: '90%' },
  scanCamera: { width: '100%', height: 320, borderRadius: 8, overflow: 'hidden' },
  notificationTitle: { color: '#596849', fontSize: 15, fontWeight: '700', marginBottom: 5 },
  price: { color: '#5f4031', fontWeight: '700', fontSize: 14 },
  total: { color: '#30251f', fontWeight: '700', fontSize: 18, textAlign: 'right', marginTop: 16 },
  pill: { backgroundColor: '#e7eddf', color: '#596849', paddingVertical: 6, paddingHorizontal: 9, borderRadius: 20, fontSize: 10, fontWeight: '700' },
  promo: { position: 'relative', backgroundColor: '#33241e', borderRadius: 14, padding: 22, paddingRight: 56, marginBottom: 18 },
  promoDismissButton: { position: 'absolute', top: 8, right: 8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.14)', zIndex: 1 },
  promoDismissText: { color: '#fff', fontSize: 24, lineHeight: 28 },
  promoTitle: { color: '#fff', fontFamily: 'Georgia', fontSize: 25, marginTop: 10, marginBottom: 8 },
  promoPrice: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 10 },
  reward: { backgroundColor: '#5f4031', borderRadius: 14, padding: 24 },
  rewardPoints: { color: '#fff', fontSize: 32, fontWeight: '700', marginVertical: 12 },
  progress: { height: 8, backgroundColor: '#866753', borderRadius: 8, marginTop: 15 },
  progressFill: { height: 8, width: '78%', backgroundColor: '#e8c4a7', borderRadius: 8 },
  chart: { color: '#d9683c', fontSize: 28, letterSpacing: 4, marginTop: 22, paddingVertical: 20 },
  pageBackground: { flex: 1, width: '100%', height: '100%', position: 'relative' },
  pageBackgroundImage: { width: '100%', height: '100%' },
  shopBackgroundTint: { backgroundColor: 'rgba(248, 243, 236, 0.42)' },
  dashboardBackgroundTint: { backgroundColor: 'rgba(248, 243, 236, 0.1)' },
  topbarTagline: { flex: 1, textAlign: 'center', fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 18, color: '#2a1c16' },
  topbarTaglineLight: { color: '#fff', textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  topbarTaglineMobile: { flexBasis: '100%', textAlign: 'left', fontSize: 22 },
});

const styles = { ...baseStyles, ...groupStyles };
