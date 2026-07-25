const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createHttpError } = require('@ecobazar/platform');

const DEFAULT_PRODUCT_IMAGES_BUCKET = 'product-images';

function createProductStorage(config = {}, client) {
  const supabaseUrl = String(config.SUPABASE_URL || '').trim();
  const serverKey = String(config.SUPABASE_SERVER_KEY || '').trim();

  if (!supabaseUrl && !serverKey) return null;
  if (!supabaseUrl || !serverKey) {
    throw new Error('Supabase product image storage configuration is incomplete');
  }

  const bucket = String(
    config.SUPABASE_PRODUCT_IMAGES_BUCKET || DEFAULT_PRODUCT_IMAGES_BUCKET,
  ).trim();
  const supabase = client || createClient(supabaseUrl, serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return {
    bucket,
    async upload({ sellerUserId, productId, buffer }) {
      const objectKey = `${sellerUserId}/${productId}/${randomUUID()}.webp`;
      const result = await supabase.storage.from(bucket).upload(objectKey, buffer, {
        cacheControl: '31536000',
        contentType: 'image/webp',
        upsert: false,
      });
      if (result?.error) throw storageError();

      const publicResult = supabase.storage.from(bucket).getPublicUrl(objectKey);
      const publicUrl = publicResult?.data?.publicUrl;
      if (!publicUrl) {
        await removeObject(supabase, bucket, objectKey);
        throw storageError();
      }

      return { bucket, objectKey, publicUrl };
    },
    async remove(objectKeys) {
      const keys = [...new Set((objectKeys || []).filter(Boolean))];
      if (keys.length === 0) return true;
      await removeObject(supabase, bucket, keys);
      return true;
    },
  };
}

async function removeObject(supabase, bucket, objectKeys) {
  const result = await supabase.storage.from(bucket).remove(
    Array.isArray(objectKeys) ? objectKeys : [objectKeys],
  );
  if (result?.error) throw storageError();
}

function storageError() {
  return createHttpError(
    'No se pudieron guardar las imágenes del producto.',
    503,
    { code: 'PRODUCT_STORAGE_UNAVAILABLE' },
  );
}

module.exports = {
  DEFAULT_PRODUCT_IMAGES_BUCKET,
  createProductStorage,
};
