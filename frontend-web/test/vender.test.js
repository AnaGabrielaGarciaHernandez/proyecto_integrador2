import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/screens/VenderScreen.jsx'),
  'utf8',
)

test('seller application flow only offers the store path and sends the real request', () => {
  assert.match(source, /post\('\/seller-applications'/);
  assert.match(source, /Continuar con mi solicitud/);
  assert.match(source, /contact_email/);
  assert.match(source, /contact_address/);
  assert.doesNotMatch(source, /tipoCuenta/);
  assert.doesNotMatch(source, /Persona física/);
})

test('seller application screen exposes a pending status and disables duplicate submissions', () => {
  assert.match(source, /get\('\/seller-applications\/me'/);
  assert.match(source, /SELLER_APPLICATION_PENDING|application\.status/);
  assert.match(source, /submittingApplication/);
})
