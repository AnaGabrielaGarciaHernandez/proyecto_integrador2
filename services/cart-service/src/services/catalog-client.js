const { createHttpError } = require('@ecobazar/platform');
const { z } = require('zod');

const CanonicalUuidSchema = z.string().uuid().transform((value) => value.toLowerCase());
const ResolvedVariantSchema = z.object({
  variant_id: CanonicalUuidSchema,
  product_id: CanonicalUuidSchema,
  size_name: z.string().min(1),
  stock: z.number().int().nonnegative(),
  product_name: z.string().min(1),
  unit_price_cents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  product_status: z.string().min(1),
  seller_id: CanonicalUuidSchema,
  seller_user_id: CanonicalUuidSchema,
  seller_name: z.string().min(1),
  seller_status: z.string().min(1),
  seller_role: z.string().min(1),
  seller_is_active: z.boolean(),
  buyer_reserved_quantity: z.number().int().nonnegative().default(0),
  cover_image: z.unknown().nullable().optional(),
});
const ResolveVariantsResponseSchema = z.object({
  variants: z.array(ResolvedVariantSchema),
});

function createCatalogClient({ baseUrl, internalToken, timeoutMs = 5000, fetchImpl = fetch }) {
  const root = baseUrl.replace(/\/$/, '');

  async function resolveVariants(variantIds, correlationId, buyerId) {
    const normalizedVariantIds = variantIds.map((variantId) => variantId.toLowerCase());
    const batches = [];
    for (let offset = 0; offset < normalizedVariantIds.length; offset += 100) {
      batches.push(normalizedVariantIds.slice(offset, offset + 100));
    }
    if (batches.length === 0) return [];

    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(timeoutMs),
    ]);
    const results = new Array(batches.length);
    let nextBatch = 0;

    async function worker() {
      while (nextBatch < batches.length) {
        const batchIndex = nextBatch;
        nextBatch += 1;
        results[batchIndex] = await resolveVariantBatch(
          batches[batchIndex],
          correlationId,
          buyerId,
          signal,
        );
      }
    }

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(4, batches.length) },
          () => worker(),
        ),
      );
      return results.flat();
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  async function resolveVariantBatch(variantIds, correlationId, buyerId, signal) {
    let response;
    try {
      response = await fetchImpl(`${root}/internal/variants/resolve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': internalToken,
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({
          variant_ids: variantIds,
          ...(buyerId ? { buyer_id: buyerId } : {}),
        }),
        signal,
      });
    } catch (cause) {
      const error = createHttpError('Catalog service is unavailable', 503, {
        code: 'CATALOG_UNAVAILABLE',
      });
      error.cause = cause;
      throw error;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (cause) {
      if (response.ok) throw invalidCatalogResponse(cause);
    }
    if (!response.ok) {
      throw createHttpError(
        data?.error?.message || 'Catalog service rejected the request',
        response.status,
        data?.error?.details,
      );
    }
    const parsed = ResolveVariantsResponseSchema.safeParse(data);
    if (!parsed.success) throw invalidCatalogResponse(parsed.error);
    const requestedIds = new Set(variantIds);
    const returnedIds = new Set();
    for (const variant of parsed.data.variants) {
      if (!requestedIds.has(variant.variant_id) || returnedIds.has(variant.variant_id)) {
        throw invalidCatalogResponse(new Error('Catalog returned an unexpected variant'));
      }
      returnedIds.add(variant.variant_id);
    }
    return parsed.data.variants;
  }

  return { resolveVariants };
}

function invalidCatalogResponse(cause) {
  const error = createHttpError('Catalog service returned an invalid response', 502, {
    code: 'CATALOG_UNAVAILABLE',
  });
  error.cause = cause;
  return error;
}

module.exports = { createCatalogClient };
