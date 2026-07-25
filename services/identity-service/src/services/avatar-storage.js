const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createHttpError } = require('@ecobazar/platform');

const DEFAULT_AVATAR_BUCKET = 'avatars';
const PUBLIC_OBJECT_PREFIX = 'storage/v1/object/public/';

function createAvatarStorage(config = {}, client) {
  const supabaseUrl = String(config.SUPABASE_URL || '').trim();
  const serverKey = String(config.SUPABASE_SERVER_KEY || '').trim();
  if (!supabaseUrl && !serverKey) return null;
  if (!supabaseUrl || !serverKey) {
    throw new Error('Supabase avatar storage configuration is incomplete');
  }

  const bucket = String(config.SUPABASE_AVATAR_BUCKET || DEFAULT_AVATAR_BUCKET).trim();
  const supabase = client || createClient(supabaseUrl, serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return {
    bucket,
    async uploadAvatar({ userId, buffer }) {
      const objectPath = `${bucket}/${userId}/${randomUUID()}.webp`;
      const uploadResult = await supabase.storage.from(bucket).upload(objectPath, buffer, {
        cacheControl: '31536000',
        contentType: 'image/webp',
        upsert: false,
      });
      if (uploadResult?.error) throw storageError();

      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      if (!data?.publicUrl) {
        await removeObject(supabase, bucket, objectPath);
        throw storageError();
      }

      return { path: objectPath, publicUrl: data.publicUrl };
    },
    async deleteAvatar(objectPath) {
      return removeObject(supabase, bucket, objectPath);
    },
    async deleteOwnedAvatar(publicUrl, userId) {
      const objectPath = getOwnedObjectPath(publicUrl, {
        supabaseUrl,
        bucket,
        userId,
      });
      if (!objectPath) return false;
      await removeObject(supabase, bucket, objectPath);
      return true;
    },
  };
}

async function removeObject(supabase, bucket, objectPath) {
  const result = await supabase.storage.from(bucket).remove([objectPath]);
  if (result?.error) throw storageError();
  return true;
}

function getOwnedObjectPath(publicUrl, { supabaseUrl, bucket, userId }) {
  if (!publicUrl || !userId) return null;

  let parsed;
  let base;
  try {
    parsed = new URL(publicUrl);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }

  if (parsed.origin !== base.origin) return null;

  const prefix = `${PUBLIC_OBJECT_PREFIX}${bucket}/`;
  const pathname = parsed.pathname.replace(/^\/+/, '');
  if (!pathname.startsWith(prefix)) return null;

  let objectPath;
  try {
    objectPath = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }

  const ownerPrefix = `${bucket}/${userId}/`;
  if (!objectPath.startsWith(ownerPrefix)) return null;
  if (objectPath.includes('..') || objectPath.includes('\\')) return null;
  return objectPath;
}

function storageError() {
  return createHttpError(
    'No se pudo guardar el avatar.',
    503,
    { code: 'AVATAR_STORAGE_UNAVAILABLE' },
  );
}

module.exports = {
  DEFAULT_AVATAR_BUCKET,
  createAvatarStorage,
  getOwnedObjectPath,
};
