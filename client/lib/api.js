import { supabase } from './supabase';
import Constants from 'expo-constants';

function getApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) return configuredUrl;

  const hostUri = Constants.expoConfig?.hostUri;
  const metroHost = hostUri?.split(':')[0];
  const isIpv4Host = /^(\d{1,3}\.){3}\d{1,3}$/.test(metroHost || '');
  if (__DEV__ && isIpv4Host) {
    return `http://${metroHost}:3000`;
  }

  return configuredUrl;
}

let apiUrl = getApiUrl();
const fallbackApiUrls = [];
let networkBackoffUntil = 0;

function getApiUrlCandidates() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  const metroHost = hostUri?.split(':')[0];
  const metroUrl = /^(\d{1,3}\.){3}\d{1,3}$/.test(metroHost || '')
    ? `http://${metroHost}:3000`
    : null;

  return [...new Set([apiUrl, configuredUrl, metroUrl, ...fallbackApiUrls]
    .filter(Boolean)
    .map((url) => url.replace(/\/+$/, '')))];
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
  for (const candidate of candidates) {
    try {
      response = await fetchApi(candidate, path, options, accessToken);
      apiUrl = candidate;
      networkBackoffUntil = 0;
      break;
    } catch {}
  }
  if (!response) {
    networkBackoffUntil = Date.now() + 30000;
    throw new Error('Unable to reach the Express API server. Keep the server running and connect the phone and PC to the same network.');
  }
  const responseText = await response.text();
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
    throw new Error(errorMessage);
  }
  return result;
}

export async function requestPublicApi(path, options = {}) {
  return requestApiWithToken(path, options, null);
}

export async function requestApi(path, options = {}) {
  if (!supabase) throw new Error('Configure Supabase before using the API.');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('Your session has expired. Sign in again.');
  return requestApiWithToken(path, options, session.access_token);
}
