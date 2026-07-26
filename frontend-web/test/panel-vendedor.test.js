import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/screens/PanelVendedorScreen.jsx'),
  'utf8',
)

test('seller publication editor is rendered as a dismissible modal', () => {
  assert.match(source, /className="seller-edit-modal-backdrop"/)
  assert.match(source, /className="seller-section seller-editor seller-edit-modal"/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /className="seller-edit-modal-close" onClick={closeEditor}/)
  assert.match(source, /event\.target === event\.currentTarget/)
  assert.match(source, /if \(event\.key === 'Escape'\)/)
  assert.match(source, /document\.addEventListener\('keydown', closeOnEscape\)/)
  assert.match(source, /document\.removeEventListener\('keydown', closeOnEscape\)/)
})

test('seller modal keeps the publication editing controls', () => {
  assert.match(source, /value={editForm\.name}/)
  assert.match(source, /value={editForm\.description}/)
  assert.match(source, /value={editForm\.condition}/)
  assert.match(source, /value={editForm\.price}/)
  assert.match(source, /editForm\.pickup_schedules\.map/)
  assert.match(source, /editForm\.variants\.map/)
  assert.match(source, /className="seller-image-manager"/)
  assert.match(source, /className="panel-save-button" type="submit"/)
})
