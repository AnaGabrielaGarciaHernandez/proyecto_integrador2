import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'

test('wishlist client lists, saves, and idempotently deletes product favorites', async (t) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const requests = []
  globalThis.window = { dispatchEvent() {} }
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url)
    requests.push({
      method: options.method || 'GET',
      path: parsed.pathname,
      search: parsed.search,
    })
    if ((options.method || 'GET') === 'GET') {
      return jsonResponse(200, {
        products: [{
          id: PRODUCT_ID,
          name: 'Prenda guardada',
          price_cents: 12500,
          total_stock: 1,
          availability_status: 'available',
          is_wishlisted: true,
          variants: [],
          images: [],
        }],
        total: 1,
        pagination: { limit: 24, offset: 0 },
      })
    }
    if (options.method === 'DELETE') return new Response(null, { status: 204 })
    return jsonResponse(200, {
      product_id: PRODUCT_ID,
      created_at: '2030-01-01T00:00:00.000Z',
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

  const wishlist = await vite.ssrLoadModule('/src/services/wishlist.js')
  const page = await wishlist.getWishlist({ limit: 24, offset: 0 })
  assert.equal(page.total, 1)
  assert.equal(page.products[0].isWishlisted, true)

  await wishlist.saveWishlistItem(PRODUCT_ID)
  await wishlist.deleteWishlistItem(PRODUCT_ID)
  assert.deepEqual(requests.map(({ method }) => method), ['GET', 'PUT', 'DELETE'])
  assert.equal(requests[0].search, '?limit=24&offset=0')
  assert.equal(requests[1].path, `/api/wishlist/${PRODUCT_ID}`)
})

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
