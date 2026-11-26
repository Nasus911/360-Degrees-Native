const { mapProcessorErrorStatus } = require('./identityVerification');

const PROCESSOR_REQUEST_TIMEOUT_MS = 90_000;
const PROCESSOR_HEALTH_REQUEST_TIMEOUT_MS = 10_000;
const PROCESSOR_STARTUP_TIMEOUT_MS = 90_000;
const PROCESSOR_HEALTH_POLL_INTERVAL_MS = 2_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForProcessorReady(processorUrl, {
  fetchImpl = fetch,
  startupTimeoutMs = PROCESSOR_STARTUP_TIMEOUT_MS,
  pollIntervalMs = PROCESSOR_HEALTH_POLL_INTERVAL_MS,
  healthRequestTimeoutMs = PROCESSOR_HEALTH_REQUEST_TIMEOUT_MS,
} = {}) {
  const healthUrl = `${processorUrl.replace(/\/+$/, '')}/health`;
  const deadline = Date.now() + startupTimeoutMs;
  let lastFailure = 'no healthy response';

  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl(healthUrl, {
        signal: AbortSignal.timeout(healthRequestTimeoutMs),
      });
      if (response.ok) {
        const health = await response.json();
        if (health?.ok === true) return;
        lastFailure = 'health endpoint did not report ready';
      } else {
        lastFailure = `health endpoint returned HTTP ${response.status}`;
        if (response.body) await response.body.cancel();
      }
    } catch {
      lastFailure = 'health endpoint is unreachable or returned invalid data';
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(pollIntervalMs, remaining));
  }

  const error = new Error(
    `The identity verification processor did not become ready after a cold start (${lastFailure}).`,
  );
  error.status = 503;
  throw error;
}

async function sendImageToProcessor(processorUrl, token, route, fields) {
  const uploads = await Promise.all(
    Object.entries(fields).map(async ([fieldName, image]) => ({
      fieldName,
      blob: new Blob([await image.blob.arrayBuffer()], {
        type: image.blob.type || 'image/jpeg',
      }),
      filename: image.filename,
    })),
  );
  const url = `${processorUrl.replace(/\/+$/, '')}${route}`;

  const sendRequest = () => {
    const form = new FormData();
    for (const upload of uploads) {
      form.append(upload.fieldName, upload.blob, upload.filename);
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'X-Verification-Token': token },
      body: form,
      signal: AbortSignal.timeout(PROCESSOR_REQUEST_TIMEOUT_MS),
    });
  };

  let response = await sendRequest();
  let contentType = response.headers.get('content-type') || 'unknown content type';
  if ([502, 503].includes(response.status) && /text\/html/i.test(contentType)) {
    if (response.body) await response.body.cancel();
    await waitForProcessorReady(processorUrl);
    response = await sendRequest();
    contentType = response.headers.get('content-type') || 'unknown content type';
  }

  const responseText = await response.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    const error = new Error(
      `The identity verification processor returned an invalid response (HTTP ${response.status}; ${contentType}).`,
    );
    error.status = 502;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(typeof payload.detail === 'string' ? payload.detail : 'The identity verification processor could not process the image.');
    error.status = mapProcessorErrorStatus(response.status);
    throw error;
  }
  return payload;
}

module.exports = {
  sendImageToProcessor,
  waitForProcessorReady,
};
