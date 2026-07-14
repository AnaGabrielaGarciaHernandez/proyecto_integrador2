const test = require('node:test');
const assert = require('node:assert/strict');
const { checkServices } = require('../src/services/health');

test('aggregates healthy downstream readiness checks', async () => {
  const result = await checkServices({
    identity: 'http://identity:4001',
    catalog: 'http://catalog:4002',
  }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }),
    timeoutMs: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.services.identity.ok, true);
  assert.equal(result.services.catalog.ok, true);
});

test('reports a failed dependency without throwing', async () => {
  const result = await checkServices({
    identity: 'http://identity:4001',
    catalog: 'http://catalog:4002',
  }, {
    fetchImpl: async (url) => {
      if (url.hostname === 'catalog') throw new Error('connection refused');
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    timeoutMs: 100,
  });
  assert.equal(result.ok, false);
  assert.equal(result.services.identity.ok, true);
  assert.equal(result.services.catalog.ok, false);
  assert.equal(result.services.catalog.error, 'unavailable');
});
