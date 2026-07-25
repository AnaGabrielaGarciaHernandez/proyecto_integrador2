import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_INPUT_BYTES,
  validateAvatarFile,
} from '../src/services/avatar.js'

test('accepts only supported MIME types within the 5 MB client limit', () => {
  for (const type of AVATAR_ALLOWED_MIME_TYPES) {
    const file = { type, size: 1024 }
    assert.equal(validateAvatarFile(file), file)
  }

  assert.throws(
    () => validateAvatarFile({ type: 'image/gif', size: 1024 }),
    /JPEG, PNG o WebP/i,
  )
  assert.throws(
    () => validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_INPUT_BYTES + 1 }),
    /5 MB/i,
  )
  assert.throws(
    () => validateAvatarFile({ type: 'image/png', size: 0 }),
    /vacía/i,
  )
})
