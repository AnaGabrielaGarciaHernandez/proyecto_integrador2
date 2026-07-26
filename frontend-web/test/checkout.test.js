import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const VARIANT_ID = '22222222-2222-4222-8222-222222222222'

test('cart changes cancel the server checkout before mutating cart state', async (t) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const requests = []
  let cancelStatus = 'cancelled'

  globalThis.window = {
    dispatchEvent() {},
  }
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname
    requests.push({ method: options.method || 'GET', path })
    if (path === '/api/checkout') {
      return jsonResponse(201, {
        checkout: {
          order_id: ORDER_ID,
          session_id: 'cs_test',
          url: 'https://checkout.stripe.test/session',
          expires_at: '2030-01-01T00:00:00.000Z',
        },
      })
    }
    if (path === '/api/checkout/active/cancel') {
      return jsonResponse(200, { order: { id: ORDER_ID, status: cancelStatus } })
    }
    if (path === '/api/cart/reconcile') {
      return jsonResponse(200, {
        cart: {
          id: '33333333-3333-4333-8333-333333333333',
          user_id: '44444444-4444-4444-8444-444444444444',
          items: [],
          subtotal_cents: 0,
          total_cents: 0,
          currency: 'MXN',
        },
        adjustments: [],
      })
    }
    if (path === '/api/cart/items') {
      return jsonResponse(201, { cart: { items: [] } })
    }
    return jsonResponse(404, { error: { message: 'Not found' } })
  }

  const vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  t.after(async () => {
    await vite.close()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  const checkoutService = await vite.ssrLoadModule('/src/services/checkout.js')
  const cartService = await vite.ssrLoadModule('/src/services/carrito.js')

  await checkoutService.crearCheckout()
  await cartService.reconciliarCarrito()
  assert.deepEqual(
    requests.slice(-2).map(({ path }) => path),
    ['/api/checkout/active/cancel', '/api/cart/reconcile'],
  )

  cancelStatus = 'pending_payment'
  await assert.rejects(
    cartService.agregarAlCarrito(VARIANT_ID),
    /El pago sigue en proceso/,
  )
  assert.notEqual(requests.at(-1).path, '/api/cart/items')
})

test('paid checkout refreshes the cart after the asynchronous order event removes purchased items', async (t) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  let cartRequests = 0
  let updateEvents = 0

  globalThis.window = {
    dispatchEvent(event) {
      if (event.type === 'carritoActualizado') updateEvents += 1
    },
  }
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname
    if (path !== '/api/cart') return jsonResponse(404, { error: { message: 'Not found' } })
    cartRequests += 1
    return jsonResponse(200, {
      cart: {
        id: '33333333-3333-4333-8333-333333333333',
        items: cartRequests === 1
          ? [{ id: 'cart-item', variant_id: VARIANT_ID, quantity: 1, unit_price_cents: 1000 }]
          : [],
      },
    })
  }

  const vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  t.after(async () => {
    await vite.close()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  const cartService = await vite.ssrLoadModule('/src/services/carrito.js')
  const cart = await cartService.sincronizarCarritoDespuesDePago([{ variant_id: VARIANT_ID }])

  assert.equal(cart.items.length, 0)
  assert.equal(cartRequests, 2)
  assert.equal(updateEvents, 1)
})

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
