import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const hasValidConfig = url
  && key
  && !url.includes('your-project-ref')
  && url !== 'https://supabase.co'
  && !key.includes('your-publishable-or-anon-key')
  && !key.includes('your-anon-public-api-key');

export const supabase = hasValidConfig
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;
