import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('seller pickup management is role-gated and has CRUD controls', () => {
  const sidebar = read('components/Sidebar.jsx')
  const screen = read('screens/PickupPointsScreen.jsx')
  const router = read('routes/AppRouter.jsx')
  assert.match(sidebar, /usuario\?\.role === 'vendedor'/)
  assert.match(screen, /getSellerPickupPoints/)
  assert.match(screen, /createSellerPickupPoint/)
  assert.match(screen, /updateSellerPickupPointStatus/)
  assert.match(router, /path="\/mis-direcciones"/)
});

test('publication and order screens carry pickup configuration without exposing public addresses', () => {
  const seller = read('screens/VenderScreen.jsx')
  const product = read('screens/ProductoScreen.jsx')
  const orders = read('screens/OrdersScreen.jsx')
  assert.match(seller, /pickup_point_id/)
  assert.match(seller, /pickup_schedules/)
  assert.match(product, /La dirección exacta y las referencias estarán disponibles después de pagar/)
  assert.match(orders, /pickup_groups/)
  assert.match(orders, /America\/Monterrey/)
});

test('payment confirmation hides identifiers and refreshes the cart after the paid event', () => {
  const checkout = read('screens/CheckoutStatusScreen.jsx')
  const cart = read('services/carrito.js')
  assert.match(checkout, /Tu pedido quedó registrado\. Te avisaremos cuando esté listo para recoger\./)
  assert.doesNotMatch(checkout, /order\.order_number/)
  assert.match(checkout, /sincronizarCarritoDespuesDePago\(nextOrder\.items\)/)
  assert.match(cart, /export async function sincronizarCarritoDespuesDePago/)
});
