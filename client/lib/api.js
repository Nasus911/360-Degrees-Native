import { supabase } from './supabase';

function normalizeApiUrl(url) {
  if (typeof url !== 'string') return null;
  return url.trim().replace(/\/+$/, '').replace(/\/api$/i, '') || null;
}

const apiUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
let networkBackoffUntil = 0;
let sessionRefreshPromise = null;

async function fetchApi(url, path, options, accessToken) {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${url}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestApiWithToken(path, options, accessToken) {
  if (!apiUrl) {
    throw new Error('Set EXPO_PUBLIC_API_URL to your Render URL in client/.env and client/eas.json.');
  }

  if (Date.now() < networkBackoffUntil) {
    throw new Error(`Server is waking up, please wait... Tried ${apiUrl}${path}.`);
  }

  let response;
  let responseText;
  try {
    response = await fetchApi(apiUrl, path, options, accessToken);
    responseText = await response.text();
    networkBackoffUntil = 0;
  } catch (error) {
    networkBackoffUntil = Date.now() + 30000;
    const reason = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Server is waking up, please wait... Tried ${apiUrl}${path}.${reason}`);
  }

  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    const responseKind = /^\s*</.test(responseText) ? 'an HTML page' : 'an invalid response';
    const requestRoute = `${(options.method || 'GET').toUpperCase()} ${path}`;
    throw new Error(`The API at ${apiUrl}${path} returned ${responseKind} for ${requestRoute} (HTTP ${response.status}). Check that EXPO_PUBLIC_API_URL points to the Express API server with this route.`);
  }
  if (!response.ok) {
    const errorMessage = result && typeof result === 'object' && typeof result.error === 'string'
      ? result.error
      : 'The request could not be completed.';
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }
  return result;
}

async function refreshSession() {
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = supabase.auth.refreshSession();
  }
  try {
    return await sessionRefreshPromise;
  } finally {
    sessionRefreshPromise = null;
  }
}

async function clearLocalSession() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function requestPublicApi(path, options = {}) {
  return requestApiWithToken(path, options, null);
}

export async function requestApi(path, options = {}) {
  if (!supabase) throw new Error('Configure Supabase before using the API.');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('Your session has expired. Sign in again.');
  try {
    return await requestApiWithToken(path, options, session.access_token);
  } catch (error) {
    if (error.status !== 401) throw error;
  }

  const { data, error: refreshError } = await refreshSession();
  if (refreshError) throw refreshError;
  if (!data.session?.access_token) {
    await clearLocalSession();
    throw new Error('Your session has expired. Sign in again.');
  }

  try {
    return await requestApiWithToken(path, options, data.session.access_token);
  } catch (error) {
    if (error.status !== 401) throw error;
    await clearLocalSession();
    throw new Error('Your session has expired. Sign in again.');
  }
}
