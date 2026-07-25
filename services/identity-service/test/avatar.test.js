const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  AVATAR_MAX_INPUT_DIMENSION,
  processAvatar,
} = require('../src/services/avatar');
const {
  createAvatarStorage,
  getOwnedObjectPath,
} = require('../src/services/avatar-storage');
const { createAvatarRateLimiter } = require('../src/services/avatar-rate-limit');

test('processes JPEG, PNG and WebP into 256x256 WebP without metadata', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const input = await makeImage(format, 700, 500, { withMetadata: format === 'jpeg' });
    const result = await processAvatar({
      buffer: input,
      mimetype: `image/${format === 'jpeg' ? 'jpeg' : format}`,
      size: input.length,
    });
    const metadata = await sharp(result.buffer).metadata();

    assert.equal(result.contentType, 'image/webp');
    assert.equal(result.width, 256);
    assert.equal(result.height, 256);
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 256);
    assert.equal(metadata.height, 256);
    assert.equal(metadata.exif, undefined);
    assert.ok(result.buffer.length <= 300 * 1024);
  }
});

test('rejects renamed text, GIF, SVG, HEIC and other unsupported MIME types', async () => {
  await assert.rejects(
    processAvatar({ buffer: Buffer.from('plain text'), mimetype: 'image/jpeg', size: 10 }),
    (error) => error.details.code === 'AVATAR_INVALID_IMAGE',
  );

  for (const mimetype of ['image/gif', 'image/svg+xml', 'image/heic', 'application/pdf']) {
    await assert.rejects(
      processAvatar({ buffer: Buffer.from('not-an-avatar'), mimetype, size: 14 }),
      (error) => error.details.code === 'AVATAR_TYPE_NOT_ALLOWED',
    );
  }
});

test('rejects files over 5 MB and images over the dimension or pixel limits', async () => {
  await assert.rejects(
    processAvatar({
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      mimetype: 'image/png',
      size: 5 * 1024 * 1024 + 1,
    }),
    (error) => error.details.code === 'AVATAR_INPUT_TOO_LARGE',
  );

  const tooWide = await makeImage('jpeg', AVATAR_MAX_INPUT_DIMENSION + 1, 20);
  await assert.rejects(
    processAvatar({ buffer: tooWide, mimetype: 'image/jpeg', size: tooWide.length }),
    (error) => error.details.code === 'AVATAR_DIMENSIONS_TOO_LARGE',
  );

  const tooManyPixels = await makeImage('png', 4096, 4096);
  await assert.rejects(
    processAvatar({ buffer: tooManyPixels, mimetype: 'image/png', size: tooManyPixels.length }),
    (error) => error.details.code === 'AVATAR_PIXELS_TOO_MANY',
  );
});

test('rejects a processed result that cannot fit the configured output limit', async () => {
  const input = await makeImage('jpeg', 700, 700);
  await assert.rejects(
    processAvatar(
      { buffer: input, mimetype: 'image/jpeg', size: input.length },
      { maxOutputBytes: 1 },
    ),
    (error) => error.details.code === 'AVATAR_OUTPUT_TOO_LARGE',
  );
});

test('uploads unique server-generated paths with immutable WebP settings', async () => {
  const uploads = [];
  const removals = [];
  const api = {
    async upload(path, buffer, options) {
      uploads.push({ path, buffer, options });
      return { data: { path }, error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/avatars/${path}` } };
    },
    async remove(paths) {
      removals.push(paths);
      return { data: paths, error: null };
    },
  };
  const storage = createAvatarStorage({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVER_KEY: 'server-only-key',
    SUPABASE_AVATAR_BUCKET: 'avatars',
  }, { storage: { from: () => api } });

  const result = await storage.uploadAvatar({
    userId: '11111111-1111-4111-8111-111111111111',
    buffer: Buffer.from('webp'),
  });

  assert.match(result.path, /^avatars\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.webp$/);
  assert.equal(uploads[0].options.contentType, 'image/webp');
  assert.equal(uploads[0].options.cacheControl, '31536000');
  assert.equal(uploads[0].options.upsert, false);
  assert.equal(result.publicUrl.endsWith(result.path), true);
  assert.deepEqual(getOwnedObjectPath(result.publicUrl, {
    supabaseUrl: 'https://project.supabase.co',
    bucket: 'avatars',
    userId: '11111111-1111-4111-8111-111111111111',
  }), result.path);
  assert.equal(getOwnedObjectPath(
    'https://evil.example/storage/v1/object/public/avatars/avatars/11111111-1111-4111-8111-111111111111/a.webp',
    {
      supabaseUrl: 'https://project.supabase.co',
      bucket: 'avatars',
      userId: '11111111-1111-4111-8111-111111111111',
    },
  ), null);

  await storage.deleteAvatar(result.path);
  assert.deepEqual(removals, [[result.path]]);
});

test('limits multipart avatar attempts per authenticated user', () => {
  let currentTime = 0;
  const limiter = createAvatarRateLimiter({ maxAttempts: 2, windowMs: 1000, now: () => currentTime });

  assert.equal(limiter.consume('user-1').allowed, true);
  assert.equal(limiter.consume('user-1').allowed, true);
  const limited = limiter.consume('user-1');
  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds, 1);
  assert.equal(limiter.consume('user-2').allowed, true);

  currentTime = 1001;
  assert.equal(limiter.consume('user-1').allowed, true);
});

async function makeImage(format, width, height, { withMetadata = false } = {}) {
  let image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 82, g: 183, b: 136 },
    },
  });
  if (withMetadata) image = image.withMetadata({ orientation: 6 });
  return image.toFormat(format).toBuffer();
}
