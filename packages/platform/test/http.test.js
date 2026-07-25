const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createEvent,
  createHttpError,
  errorHandler,
  requireInternalToken,
} = require('../src');
const { EVENT_TYPES } = require('@ecobazar/contracts');

test('creates event envelopes with correlation metadata', () => {
  const correlationId = '11111111-1111-4111-8111-111111111111';
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_CANCELLED,
    producer: 'order-service',
    correlationId,
    payload: { order_id: '22222222-2222-4222-8222-222222222222' },
  });
  assert.equal(event.correlation_id, correlationId);
  assert.equal(event.event_version, 1);
});

test('error handler preserves client error responses', () => {
  const error = createHttpError('Requested quantity exceeds available stock', 409, {
    code: 'STOCK_UNAVAILABLE',
    available: 2,
  });
  const response = runErrorHandler(error);

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    error: {
      message: 'Requested quantity exceeds available stock',
      details: {
        code: 'STOCK_UNAVAILABLE',
        available: 2,
      },
    },
  });
});

test('internal routes require the exact server token', () => {
  const middleware = requireInternalToken('internal-token-that-is-long-enough');
  const outcomes = [];
  const request = (token) => ({
    get(name) {
      return name === 'x-internal-token' ? token : undefined;
    },
  });
  middleware(request('forged'), {}, (error) => outcomes.push(error?.status || 200));
  middleware(request('internal-token-that-is-long-enough'), {}, (error) => outcomes.push(error?.status || 200));
  assert.deepEqual(outcomes, [401, 200]);
});

test('error handler hides internal error messages and details', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  const error = createHttpError(
    'column "quantity" is of type integer but expression is of type text',
    500,
    {
      code: '22P02',
      query: 'UPDATE cart_items SET quantity = $1',
    },
  );
  const response = runErrorHandler(error);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    error: {
      message: 'Internal server error',
      details: { code: 'INTERNAL_ERROR' },
    },
  });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].length, 1);
  const record = JSON.parse(logged[0][0]);
  assert.equal(record.error.details_code, '22P02');
  assert.doesNotMatch(logged[0][0], /quantity|UPDATE cart_items|column/i);
});

test('error handler preserves stable operational codes for server errors', (t) => {
  t.mock.method(console, 'error', () => {});
  const error = createHttpError('Stripe API key sk_live_secret failed', 503, {
    code: 'STRIPE_UNAVAILABLE',
    dependency: 'stripe',
    apiKey: 'sk_live_secret',
  });
  const response = runErrorHandler(error);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: {
      message: 'Internal server error',
      details: { code: 'STRIPE_UNAVAILABLE' },
    },
  });
});

test('safe error logs redact provider secrets and never include request bodies', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  const error = createHttpError(
    'Supabase sb_secret_do_not-log and Stripe sk_live_do-not-log failed',
    500,
    { code: 'DEPENDENCY_FAILURE', body: { image: 'binary-content' } },
  );
  runErrorHandler(error);

  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0][0], /sb_secret|sk_live|binary-content|image/);
  assert.match(logged[0][0], /DEPENDENCY_FAILURE/);
});

test('error handler rejects internal-looking and database server error codes', (t) => {
  t.mock.method(console, 'error', () => {});

  for (const code of ['P0001', 'XX000', 'POSTGRES_TIMEOUT', 'ECONNREFUSED']) {
    const response = runErrorHandler(createHttpError('Sensitive failure', 500, { code }));
    assert.deepEqual(response.body, {
      error: {
        message: 'Internal server error',
        details: { code: 'INTERNAL_ERROR' },
      },
    });
  }
});

function runErrorHandler(error) {
  const response = {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  errorHandler(
    error,
    {
      serviceName: 'platform-test',
      correlationId: '11111111-1111-4111-8111-111111111111',
    },
    response,
    () => {},
  );
  return response;
}
