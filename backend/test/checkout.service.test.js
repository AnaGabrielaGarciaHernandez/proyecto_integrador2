const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://localhost:5432/bd_EcoBazar_test';
process.env.JWT_SECRET ||= 'test_secret_that_is_long_enough';
process.env.CLIENT_ORIGIN ||= 'http://localhost:5173';

const {
  CHECKOUT_MINUTES,
  businessError,
  cancelPendingOrder,
  createCheckout,
  constructWebhookEvent,
  processStripeEvent,
} = require('../src/services/checkout.service');

test('checkout reservations last thirty minutes', () => {
  assert.equal(CHECKOUT_MINUTES, 30);
});

test('business errors expose a stable details code', () => {
  const error = businessError('Empty', 'CART_EMPTY', 409, { cart_id: 'cart-1' });
  assert.equal(error.status, 409);
  assert.deepEqual(error.details, { code: 'CART_EMPTY', cart_id: 'cart-1' });
});

test('checkout uses cart snapshots, reserves stock, and sends calculated totals to Stripe', async () => {
  const fixture = checkoutFixture();
  const checkout = await createCheckout('buyer-1', fixture.dependencies);

  assert.equal(checkout.order_id, 'order-buyer-1');
  assert.equal(fixture.state.stock, 1);
  assert.equal(fixture.state.createdSessions.length, 1);
  const request = fixture.state.createdSessions[0];
  assert.equal(request.line_items[0].price_data.unit_amount, 12500);
  assert.equal(request.line_items[0].quantity, 2);
  assert.deepEqual(request.metadata, { order_id: 'order-buyer-1', buyer_id: 'buyer-1' });
});

test('checkout rejects an empty cart', async () => {
  const fixture = checkoutFixture({ items: [] });
  await assert.rejects(
    createCheckout('buyer-1', fixture.dependencies),
    (error) => error.details.code === 'CART_EMPTY',
  );
  assert.equal(fixture.state.createdSessions.length, 0);
});

test('checkout rejects insufficient stock before creating an order', async () => {
  const fixture = checkoutFixture({ stock: 1 });
  await assert.rejects(
    createCheckout('buyer-1', fixture.dependencies),
    (error) => error.details.code === 'STOCK_UNAVAILABLE' && error.details.available === 1,
  );
  assert.equal(fixture.state.createdSessions.length, 0);
});

test('duplicate checkout reuses the open Stripe session', async () => {
  const pending = {
    id: 'order-existing',
    order_number: 'ECO-2026-000001',
    stripe_checkout_session_id: 'cs_existing',
  };
  const fixture = checkoutFixture({ pending });
  const checkout = await createCheckout('buyer-1', fixture.dependencies);

  assert.equal(checkout.session_id, 'cs_existing');
  assert.equal(fixture.state.stock, 3);
  assert.equal(fixture.state.createdSessions.length, 0);
});

test('Stripe failure rolls back the reservation and returns STRIPE_UNAVAILABLE', async () => {
  const fixture = checkoutFixture({ stripeFailure: true });
  await assert.rejects(
    createCheckout('buyer-1', fixture.dependencies),
    (error) => error.status === 503 && error.details.code === 'STRIPE_UNAVAILABLE',
  );
  assert.equal(fixture.state.stock, 3);
});

test('two buyers competing for the last units cannot both reserve them', async () => {
  const fixture = checkoutFixture({ stock: 2 });
  await createCheckout('buyer-1', fixture.dependencies);
  await assert.rejects(
    createCheckout('buyer-2', fixture.dependencies),
    (error) => error.details.code === 'STOCK_UNAVAILABLE',
  );
  assert.equal(fixture.state.stock, 0);
  assert.equal(fixture.state.createdSessions.length, 1);
});

test('cancelling a pending order restores stock and cancels payment', async () => {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (statements.length === 1) return { rows: [{ id: 'order-1' }] };
      return { rows: [] };
    },
  };

  const changed = await cancelPendingOrder(client, 'order-1', {
    rawEvent: { id: 'evt_1', type: 'checkout.session.expired' },
  });

  assert.equal(changed, true);
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /status = 'pending_payment'/);
  assert.match(statements[1].sql, /SET stock = pv\.stock \+ restored\.quantity/);
  assert.match(statements[2].sql, /SET status = 'cancelled'/);
  assert.equal(JSON.parse(statements[2].params[1]).id, 'evt_1');
});

test('repeated cancellation does not restore stock twice', async () => {
  let calls = 0;
  const client = {
    async query() {
      calls += 1;
      return { rows: [] };
    },
  };

  const changed = await cancelPendingOrder(client, 'order-1', { rawEvent: null });
  assert.equal(changed, false);
  assert.equal(calls, 1);
});

test('webhook rejects a missing signature', () => {
  assert.throws(
    () => constructWebhookEvent(Buffer.from('{}'), '', {
      stripeClient: { webhooks: { constructEvent() {} } },
      webhookSecret: 'whsec_test',
    }),
    (error) => error.status === 400 && error.details.code === 'INVALID_SIGNATURE',
  );
});

test('webhook rejects an invalid signature', () => {
  assert.throws(
    () => constructWebhookEvent(Buffer.from('{}'), 'bad', {
      stripeClient: { webhooks: { constructEvent() { throw new Error('bad signature'); } } },
      webhookSecret: 'whsec_test',
    }),
    (error) => error.status === 400 && error.details.code === 'INVALID_SIGNATURE',
  );
});

test('paid webhook marks the order paid and removes only purchased cart quantities', async () => {
  const statements = [];
  const client = webhookClient('pending_payment', statements);
  await processStripeEvent(checkoutEvent('checkout.session.completed', 'paid'), {
    stripeClient: {},
    transaction: (work) => work(client),
  });

  assert.ok(statements.some(({ sql }) => /SET status = 'paid'/.test(sql)));
  const cartStatements = statements.filter(({ sql }) => /cart_items ci/.test(sql));
  assert.equal(cartStatements.length, 2);
  assert.match(cartStatements[0].sql, /DELETE FROM cart_items/);
  assert.match(cartStatements[1].sql, /UPDATE cart_items/);
  assert.ok(statements.some(({ sql }) => /SET status = 'succeeded'/.test(sql)));
});

test('duplicate paid webhook does not clear the cart again', async () => {
  const statements = [];
  const client = webhookClient('paid', statements);
  await processStripeEvent(checkoutEvent('checkout.session.completed', 'paid'), {
    stripeClient: {},
    transaction: (work) => work(client),
  });

  assert.equal(statements.filter(({ sql }) => /cart_items ci/.test(sql)).length, 0);
  assert.equal(statements.filter(({ sql }) => /SET status = 'paid'/.test(sql)).length, 0);
  assert.equal(statements.filter(({ sql }) => /SET status = 'succeeded'/.test(sql)).length, 1);
});

test('expired webhook restores reserved stock once', async () => {
  const statements = [];
  const client = webhookClient('pending_payment', statements);
  await processStripeEvent(checkoutEvent('checkout.session.expired', 'unpaid'), {
    stripeClient: {},
    transaction: (work) => work(client),
  });

  assert.equal(statements.filter(({ sql }) => /restored\.quantity/.test(sql)).length, 1);
  assert.equal(statements.filter(({ sql }) => /SET status = 'cancelled'/.test(sql)).length, 2);
});

function checkoutEvent(type, paymentStatus) {
  return {
    id: 'evt_test',
    type,
    data: {
      object: {
        id: 'cs_test',
        payment_status: paymentStatus,
        payment_intent: null,
        metadata: { order_id: 'order-1', buyer_id: 'buyer-1' },
      },
    },
  };
}

function webhookClient(orderStatus, statements) {
  return {
    async query(sql, params) {
      statements.push({ sql, params });
      if (/SELECT id, buyer_id, status FROM orders/.test(sql)) {
        return { rows: [{ id: 'order-1', buyer_id: 'buyer-1', status: orderStatus }] };
      }
      if (/UPDATE orders[\s\S]*status = 'cancelled'/.test(sql)) {
        return { rows: orderStatus === 'pending_payment' ? [{ id: 'order-1' }] : [] };
      }
      return { rows: [] };
    },
  };
}

function checkoutFixture(options = {}) {
  const state = {
    stock: options.stock ?? 3,
    createdSessions: [],
  };
  const baseItem = {
    cart_id: 'cart-1',
    variant_id: 'variant-1',
    quantity: 2,
    unit_price_cents: 12500,
    stock: state.stock,
    size_name: 'M',
    product_name: 'Chamarra circular',
    currency: 'MXN',
    product_status: 'active',
    seller_id: 'seller-1',
  };

  const stripeClient = {
    checkout: {
      sessions: {
        async retrieve(id) {
          return { id, status: 'open', url: `https://checkout.stripe.test/${id}`, expires_at: 1_800_000_000 };
        },
        async create(request) {
          if (options.stripeFailure) {
            const error = new Error('Stripe unavailable');
            error.type = 'StripeAPIError';
            throw error;
          }
          state.createdSessions.push(request);
          return {
            id: `cs_${request.metadata.buyer_id}`,
            status: 'open',
            url: `https://checkout.stripe.test/${request.metadata.buyer_id}`,
            expires_at: 1_800_000_000,
          };
        },
        async expire() {},
      },
    },
  };

  const transaction = async (work) => {
    const snapshot = state.stock;
    try {
      return await work({
        async query(sql, params) {
          if (/SELECT o\.id, o\.order_number/.test(sql)) return { rows: options.pending ? [options.pending] : [] };
          if (/SELECT sc\.id AS cart_id/.test(sql)) {
            const source = options.items === undefined ? [baseItem] : options.items;
            return { rows: source.map((item) => ({ ...item, stock: state.stock })) };
          }
          if (/INSERT INTO orders/.test(sql)) {
            return { rows: [{ id: `order-${params[0]}`, order_number: 'ECO-2026-000001' }] };
          }
          if (/UPDATE product_variants SET stock = stock -/.test(sql)) state.stock -= Number(params[0]);
          return { rows: [] };
        },
      });
    } catch (error) {
      state.stock = snapshot;
      throw error;
    }
  };

  return { state, dependencies: { stripeClient, transaction } };
}
