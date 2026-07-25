const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createSellerApplication,
  getLatestSellerApplication,
} = require('../src/services/seller-applications');
const {
  requireApplicationCustomer,
} = require('../src/routes/seller-applications');
const { createInternalRouter } = require('../src/routes/internal');

const USER_ID = '11111111-1111-4111-8111-111111111111';

test('seller application migration stores business contact fields and lookup index', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../migrations/007_seller_application_contacts.sql'),
    'utf8',
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS contact_email varchar\(255\)/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS contact_address varchar\(255\)/i);
  assert.match(migration, /seller_applications_user_status_created_idx/i);
});

test('seller application requires an authenticated customer', () => {
  assert.equal(runAuth({}), 401);
  assert.equal(runAuth({ 'x-user-id': USER_ID, 'x-user-role': 'vendedor' }), 403);
  assert.equal(runAuth({ 'x-user-id': USER_ID, 'x-user-role': 'cliente' }), 'next');
});

test('creating a seller application persists a store request and contact details', async () => {
  const statements = [];
  const application = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: USER_ID,
    seller_type: 'store',
    requested_display_name: 'Tienda Verde',
    contact_phone: '8180000000',
    contact_email: 'contacto@tiendaverde.mx',
    contact_address: 'Av. Circular 123, Centro',
    description: 'Tienda de moda circular desde 2020.',
    status: 'pending',
  };
  const db = {
    async transaction(work) {
      return work({
        async query(sql, params = []) {
          statements.push({ sql, params });
          if (/RETURNING/i.test(sql)) return { rows: [application] };
          return { rows: [] };
        },
      });
    },
  };

  const result = await createSellerApplication(db, USER_ID, {
    requested_display_name: 'Tienda Verde',
    contact_phone: '8180000000',
    contact_email: 'contacto@tiendaverde.mx',
    contact_address: 'Av. Circular 123, Centro',
    description: 'Tienda de moda circular desde 2020.',
  });

  assert.equal(result.seller_type, 'store');
  assert.match(statements[2].sql, /INSERT INTO seller_applications/);
  assert.match(statements[2].sql, /VALUES \(\$1, \$2, 'store'/);
  assert.deepEqual(statements[2].params, [
    USER_ID,
    'Tienda Verde',
    'Tienda de moda circular desde 2020.',
    '8180000000',
    'contacto@tiendaverde.mx',
    'Av. Circular 123, Centro',
  ]);
});

test('a customer cannot create a second pending seller application', async () => {
  const db = {
    async transaction(work) {
      return work({
        async query(sql) {
          if (/SELECT id/i.test(sql)) {
            return { rows: [{ id: '22222222-2222-4222-8222-222222222222', status: 'pending' }] };
          }
          return { rows: [] };
        },
      });
    },
  };

  await assert.rejects(
    createSellerApplication(db, USER_ID, {
      requested_display_name: 'Tienda Verde',
      contact_phone: '8180000000',
      contact_email: 'contacto@tiendaverde.mx',
      contact_address: 'Av. Circular 123, Centro',
      description: 'Tienda de moda circular desde 2020.',
    }),
    (error) => error.status === 409 && error.details.code === 'SELLER_APPLICATION_PENDING',
  );
});

test('latest seller application is scoped to the authenticated user', async () => {
  let statement;
  const db = {
    async query(sql, params) {
      statement = { sql, params };
      return { rows: [{ status: 'rejected', user_id: USER_ID }] };
    },
  };

  const result = await getLatestSellerApplication(db, USER_ID);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(statement.params, [USER_ID]);
  assert.match(statement.sql, /WHERE user_id = \$1/);
});

test('admin application listing exposes business contact details', async () => {
  let statement;
  const handler = getInternalHandler({
    async query(sql) {
      statement = sql;
      return { rows: [{ contact_email: 'contacto@tiendaverde.mx' }] };
    },
  }, '/seller-applications');
  let response;
  await handler({}, { json(value) { response = value; } }, (error) => { throw error; });

  assert.equal(response.applications[0].contact_email, 'contacto@tiendaverde.mx');
  assert.match(statement, /contact_email/);
  assert.match(statement, /contact_address/);
});

test('approving an application copies the business address to the seller profile', async () => {
  const statements = [];
  const application = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: USER_ID,
    seller_type: 'store',
    requested_display_name: 'Tienda Verde',
    description: 'Tienda de moda circular desde 2020.',
    contact_phone: '8180000000',
    contact_address: 'Av. Circular 123, Centro',
  };
  const handler = getInternalHandler({
    async transaction(work) {
      return work({
        async query(sql, params) {
          statements.push({ sql, params });
          if (/UPDATE catalog\.seller_applications/i.test(sql)) {
            return { rowCount: 1, rows: [application] };
          }
          return { rows: [] };
        },
      });
    },
  }, '/seller-applications/:id/status');
  let response;
  await handler(
    { params: { id: application.id }, body: { status: 'approved' } },
    { json(value) { response = value; } },
    (error) => { throw error; },
  );

  assert.equal(response.id, application.id);
  assert.match(statements[1].sql, /address_line/);
  assert.equal(statements[1].params[5], application.contact_address);
});

function runAuth(headers) {
  const req = { get(name) { return headers[name.toLowerCase()]; } };
  let outcome = 'next';
  requireApplicationCustomer(req, {}, (error) => {
    if (error) outcome = error.status;
  });
  return outcome;
}

function getInternalHandler(db, pathName) {
  const router = createInternalRouter({ db, internalToken: 'test-internal-token' });
  const layer = router.stack.find((entry) => entry.route?.path === pathName);
  return layer.route.stack[0].handle;
}
