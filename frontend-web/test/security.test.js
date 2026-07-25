import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

function readSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? readSourceFiles(fullPath) : [fullPath]
  }).filter((filePath) => /\.(jsx?|css)$/.test(filePath))
}

test('frontend source does not contain Supabase server credentials', () => {
  const source = readSourceFiles(sourceRoot).map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n')
  assert.doesNotMatch(source, /SUPABASE_SERVER_KEY|service_role|sb_secret_/i)
})
