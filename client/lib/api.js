import { supabase } from './supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function normalizeApiUrl(url) {
  if (typeof url !== 'string') return null;
  return url.trim().replace(/\/+$/, '').replace(/\/api$/i, '') || null;
}

function isDevelopmentHost(host) {
  return host === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host || '');
}

function getDevelopmentApiUrl() {
  if (!__DEV__) return null;

  const hostUri = Constants.expoConfig?.hostUri;
  const metroHost = hostUri?.split(':')[0];
  const browserHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.hostname
    : null;
  const host = [metroHost, browserHost].find(isDevelopmentHost);
  return host ? `http://${host}:3000` : null;
}

function getApiUrl() {
  return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL) || getDevelopmentApiUrl();
}

let apiUrl = getApiUrl();
const fallbackApiUrls = [];
let networkBackoffUntil = 0;
let sessionRefreshPromise = null;

function getApiUrlCandidates() {
  const configuredUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
  const developmentUrl = getDevelopmentApiUrl();
  return [...new Set([developmentUrl, apiUrl, configuredUrl, ...fallbackApiUrls]
    .map(normalizeApiUrl)
    .filter(Boolean))];
}

async function fetchApi(url, path, options, accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${url}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '360-degrees-app',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestApiWithToken(path, options, accessToken) {
  if (Date.now() < networkBackoffUntil) {
    throw new Error('Express API is temporarily unreachable. Waiting before retrying.');
  }

  const candidates = getApiUrlCandidates();
  if (!candidates.length) throw new Error('Configure EXPO_PUBLIC_API_URL to the Express API server.');

  let response;
  let responseText;
  let htmlResponse;
  let lastNetworkError;
  for (const candidate of candidates) {
    try {
      const candidateResponse = await fetchApi(candidate, path, options, accessToken);
      const candidateText = await candidateResponse.text();
      const contentType = candidateResponse.headers.get('content-type') || '';
      if (contentType.includes('text/html') || /^\s*</.test(candidateText)) {
        htmlResponse = { response: candidateResponse, responseText: candidateText };
        continue;
      }
      response = candidateResponse;
      responseText = candidateText;
      apiUrl = candidate;
      networkBackoffUntil = 0;
      break;
    } catch (error) {
      lastNetworkError = error;
    }
  }
  if (!response && htmlResponse) {
    response = htmlResponse.response;
    responseText = htmlResponse.responseText;
  }
  if (!response) {
    networkBackoffUntil = Date.now() + 30000;
    const reason = lastNetworkError instanceof Error ? ` ${lastNetworkError.message}` : '';
    throw new Error(`Unable to reach the Express API server. Keep the server running and connect the phone and PC to the same network.${reason}`);
  }
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    const responseKind = /^\s*</.test(responseText) ? 'an HTML page' : 'an invalid response';
    const requestRoute = `${(options.method || 'GET').toUpperCase()} ${path}`;
    throw new Error(`The API returned ${responseKind} for ${requestRoute} (HTTP ${response.status}). Check that EXPO_PUBLIC_API_URL points to the Express API server with this route.`);
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
