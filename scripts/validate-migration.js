const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { databaseConfig } = require('./database-config');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env'), quiet: true });
const pool = new Pool(databaseConfig());

const comparisons = [
  ['users', 'public.users', 'identity.users'],
  ['files', 'public.files', 'catalog.files'],
  ['seller_profiles', 'public.seller_profiles', 'catalog.seller_profiles'],
  ['seller_applications', 'public.seller_applications', 'catalog.seller_applications'],
  ['bazaars', 'public.bazaars', 'catalog.bazaars'],
  ['bazaar_members', 'public.bazaar_members', 'catalog.bazaar_members'],
  ['categories', 'public.categories', 'catalog.categories'],
  ['products', 'public.products', 'catalog.products'],
  ['variants', 'public.product_variants', 'catalog.product_variants'],
  ['product_images', 'public.product_images', 'catalog.product_images'],
  ['carts', 'public.shopping_carts', 'cart.shopping_carts'],
  ['cart_items', 'public.cart_items', 'cart.cart_items'],
  ['orders', 'public.orders', 'ordering.orders'],
  ['order_items', 'public.order_items', 'ordering.order_items'],
  ['payments', 'public.payments', 'payment.payments'],
  ['reviews', 'public.reviews', 'moderation.reviews'],
  ['reports', 'public.reports', 'moderation.reports'],
  ['admin_actions', 'public.admin_actions', 'moderation.admin_actions'],
];

async function scalar(sql) {
  return Number((await pool.query(sql)).rows[0].value);
}

async function relationExists(relation) {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [relation]);
  return result.rows[0].exists;
}

async function main() {
  let failed = false;
  for (const [name, legacy, target] of comparisons) {
    const legacyExists = await relationExists(legacy);
    const before = legacyExists ? await scalar(`SELECT count(*) AS value FROM ${legacy}`) : 0;
    const after = await scalar(`SELECT count(*) AS value FROM ${target}`);
    const ok = before === after;
    failed ||= !ok;
    console.log(`[validation] metric=count table=${name} before=${before} after=${after} legacy_exists=${legacyExists} ok=${ok}`);
  }

  const metrics = [
    ['stock', 'SELECT COALESCE(sum(stock),0) AS value FROM public.product_variants', 'SELECT COALESCE(sum(stock),0) AS value FROM catalog.product_variants'],
    ['order_total', 'SELECT COALESCE(sum(total_cents),0) AS value FROM public.orders', 'SELECT COALESCE(sum(total_cents),0) AS value FROM ordering.orders'],
    ['payment_total', 'SELECT COALESCE(sum(amount_cents),0) AS value FROM public.payments', 'SELECT COALESCE(sum(amount_cents),0) AS value FROM payment.payments'],
  ];
  for (const [name, beforeSql, afterSql] of metrics) {
    const before = await scalar(beforeSql);
    const after = await scalar(afterSql);
    const ok = before === after;
    failed ||= !ok;
    console.log(`[validation] metric=${name} before=${before} after=${after} ok=${ok}`);
  }

  const identityChecks = [
    ['users', 'public.users', 'identity.users', 'id'],
    ['products', 'public.products', 'catalog.products', 'id'],
    ['variants', 'public.product_variants', 'catalog.product_variants', 'id'],
    ['carts', 'public.shopping_carts', 'cart.shopping_carts', 'id'],
    ['orders', 'public.orders', 'ordering.orders', 'id'],
    ['order_numbers', 'public.orders', 'ordering.orders', 'order_number'],
    ['payments', 'public.payments', 'payment.payments', 'id'],
  ];
  for (const [name, legacy, target, column] of identityChecks) {
    const differences = await scalar(`
      SELECT count(*) AS value FROM (
        (SELECT ${column} FROM ${legacy} EXCEPT SELECT ${column} FROM ${target})
        UNION ALL
        (SELECT ${column} FROM ${target} EXCEPT SELECT ${column} FROM ${legacy})
      ) differences
    `);
    const ok = differences === 0;
    failed ||= !ok;
    console.log(`[validation] metric=preserved_identity table=${name} differences=${differences} ok=${ok}`);
  }

  const referenceChecks = [
    ['catalog_seller_user', `SELECT count(*) AS value
      FROM catalog.seller_profiles sp
      LEFT JOIN catalog.user_role_projection up ON up.user_id = sp.user_id
      WHERE up.user_id IS NULL`],
    ['cart_variant', `SELECT count(*) AS value
      FROM cart.cart_items ci
      LEFT JOIN catalog.product_variants pv ON pv.id = ci.variant_id
      WHERE pv.id IS NULL`],
    ['order_buyer', `SELECT count(*) AS value
      FROM ordering.orders o
      LEFT JOIN identity.users u ON u.id = o.buyer_id
      WHERE u.id IS NULL`],
    ['order_variant', `SELECT count(*) AS value
      FROM ordering.order_items oi
      LEFT JOIN catalog.product_variants pv ON pv.id = oi.variant_id
      WHERE oi.variant_id IS NOT NULL AND pv.id IS NULL`],
    ['payment_order', `SELECT count(*) AS value
      FROM payment.payments p
      LEFT JOIN ordering.orders o ON o.id = p.order_id
      WHERE o.id IS NULL`],
    ['review_order', `SELECT count(*) AS value
      FROM moderation.reviews r
      LEFT JOIN ordering.orders o ON o.id = r.order_id
      WHERE o.id IS NULL`],
  ];
  for (const [name, sql] of referenceChecks) {
    const orphaned = await scalar(sql);
    const ok = orphaned === 0;
    failed ||= !ok;
    console.log(`[validation] metric=orphaned reference=${name} count=${orphaned} ok=${ok}`);
  }

  const crossSchemaGrants = await scalar(`
    WITH service_schemas(role_name, own_schema) AS (VALUES
      ('ecobazar_identity', 'identity'),
      ('ecobazar_catalog', 'catalog'),
      ('ecobazar_cart', 'cart'),
      ('ecobazar_ordering', 'ordering'),
      ('ecobazar_payment', 'payment'),
      ('ecobazar_moderation', 'moderation')
    ), all_schemas(schema_name) AS (VALUES
      ('identity'), ('catalog'), ('cart'), ('ordering'), ('payment'), ('moderation')
    )
    SELECT count(*) AS value
    FROM service_schemas CROSS JOIN all_schemas
    WHERE own_schema <> schema_name
      AND has_schema_privilege(role_name, schema_name, 'USAGE')
  `);
  const isolationOk = crossSchemaGrants === 0;
  failed ||= !isolationOk;
  console.log(`[validation] metric=cross_schema_grants count=${crossSchemaGrants} ok=${isolationOk}`);

  await pool.end();
  if (failed) process.exitCode = 1;
  else console.log('[validation] migration checks passed');
}

main().catch(async (error) => {
  console.error('[validation] failed', error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
