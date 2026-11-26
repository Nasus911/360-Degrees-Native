const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const {
  sendImageToProcessor,
  waitForProcessorReady,
} = require('./identityProcessor');

test('processor request waits for the service and retries a Render cold-start 502 once', async () => {
  let healthRequests = 0;
  let scanRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      healthRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    scanRequests += 1;
    if (scanRequests === 1) {
      response.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<html>Service is starting</html>');
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'passed', fields: { full_name: 'Sample Person' } }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendImageToProcessor(
      `http://127.0.0.1:${port}`,
      'test-token',
      '/scan-id',
      { file: { blob: new Blob(['image']), filename: 'id.jpg' } },
    );
    assert.equal(result.status, 'passed');
    assert.equal(scanRequests, 2);
    assert.equal(healthRequests, 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('processor readiness polling retries non-ready health responses', async () => {
  let requests = 0;
  await waitForProcessorReady('https://processor.example', {
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({ ok: requests > 1 }), {
        status: requests > 1 ? 200 : 503,
        headers: { 'content-type': 'application/json' },
      });
    },
    startupTimeoutMs: 100,
    pollIntervalMs: 0,
  });
  assert.equal(requests, 2);
});
