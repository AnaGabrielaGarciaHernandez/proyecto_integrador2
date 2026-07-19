const test = require('node:test');
const assert = require('node:assert/strict');

const { createCatalogClient } = require('../src/services/catalog-client');

test('resolveVariants respects the Catalog batch limit', async () => {
  const requests = [];
  const signals = new Set();
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const client = createCatalogClient({
    baseUrl: 'http://catalog.test',
    internalToken: 'internal-token',
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      signals.add(options.signal);
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setImmediate(resolve));
      activeRequests -= 1;
      return {
        ok: true,
        json: async () => ({
          variants: body.variant_ids.map(resolvedVariant),
        }),
      };
    },
  });
  const ids = Array.from(
    { length: 405 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );
  const buyerId = '10000000-0000-4000-8000-000000000001';

  const variants = await client.resolveVariants(ids, 'correlation-id', buyerId);

  assert.deepEqual(
    requests.map(({ body }) => body.variant_ids.length).sort((left, right) => left - right),
    [5, 100, 100, 100, 100],
  );
  assert.equal(variants.length, 405);
  assert.equal(variants[0].variant_id, ids[0]);
  assert.equal(variants[404].variant_id, ids[404]);
  assert.equal(maxActiveRequests, 4);
  assert.equal(signals.size, 1);
  assert.ok(requests.every(({ body }) => body.buyer_id === buyerId));
  assert.equal(requests[0].options.headers['x-internal-token'], 'internal-token');
});

test('resolveVariants rejects unreadable and malformed successful responses', async () => {
  const unreadable = createCatalogClient({
    baseUrl: 'http://catalog.test',
    internalToken: 'internal-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    }),
  });
  const malformed = createCatalogClient({
    baseUrl: 'http://catalog.test',
    internalToken: 'internal-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ variants: [{}] }),
    }),
  });
  const ids = ['00000000-0000-4000-8000-000000000001'];

  for (const client of [unreadable, malformed]) {
    await assert.rejects(
      client.resolveVariants(ids, 'correlation-id'),
      (error) => error.status === 502
        && error.details.code === 'CATALOG_UNAVAILABLE',
    );
  }
});

test('resolveVariants rejects unexpected and duplicate variant ids', async () => {
  const requestedId = '00000000-0000-4000-8000-000000000001';
  const unexpectedId = '00000000-0000-4000-8000-000000000002';
  const responses = [
    [resolvedVariant(unexpectedId), resolvedVariant(requestedId)],
    [resolvedVariant(requestedId), resolvedVariant(requestedId)],
  ];

  for (const variants of responses) {
    const client = createCatalogClient({
      baseUrl: 'http://catalog.test',
      internalToken: 'internal-token',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ variants }),
      }),
    });

    await assert.rejects(
      client.resolveVariants([requestedId], 'correlation-id'),
      (error) => error.status === 502
        && error.details.code === 'CATALOG_UNAVAILABLE',
    );
  }
});

test('resolveVariants treats UUID casing as equivalent and returns canonical ids', async () => {
  const canonicalId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
  const client = createCatalogClient({
    baseUrl: 'http://catalog.test',
    internalToken: 'internal-token',
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body).variant_ids, [canonicalId]);
      return {
        ok: true,
        status: 200,
        json: async () => ({ variants: [resolvedVariant(canonicalId.toUpperCase())] }),
      };
    },
  });

  const variants = await client.resolveVariants([canonicalId.toUpperCase()], 'correlation-id');

  assert.equal(variants[0].variant_id, canonicalId);
});

function resolvedVariant(variantId) {
  return {
    variant_id: variantId,
    product_id: '10000000-0000-4000-8000-000000000001',
    size_name: 'M',
    stock: 2,
    product_name: 'Sudadera',
    unit_price_cents: 15000,
    currency: 'MXN',
    product_status: 'active',
    seller_id: '20000000-0000-4000-8000-000000000001',
    seller_user_id: '30000000-0000-4000-8000-000000000001',
    seller_name: 'Tienda Circular',
    seller_status: 'approved',
    seller_role: 'vendedor',
    seller_is_active: true,
    buyer_reserved_quantity: 0,
    cover_image: null,
  };
}
