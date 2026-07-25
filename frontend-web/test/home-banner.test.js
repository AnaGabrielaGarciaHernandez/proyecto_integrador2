import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/screens/HomeScreen.jsx'),
  'utf8',
)

test('home seller banner is limited to customer accounts', () => {
  assert.match(source, /user\.role === 'cliente'/)
  assert.match(source, /show_home_sell_banner === true/)
})
