const { createHttpError } = require('@ecobazar/platform');

function createCatalogClient({ baseUrl, internalToken, timeoutMs = 5000, fetchImpl = fetch }) {
  const root = baseUrl.replace(/\/$/, '');

  async function resolveVariants(variantIds, correlationId) {
    let response;
    try {
      response = await fetchImpl(`${root}/internal/variants/resolve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': internalToken,
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({ variant_ids: variantIds }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const error = createHttpError('Catalog service is unavailable', 503, {
        code: 'CATALOG_UNAVAILABLE',
      });
      error.cause = cause;
      throw error;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw createHttpError(
        data?.error?.message || 'Catalog service rejected the request',
        response.status,
        data?.error?.details,
      );
    }
    return data?.variants || [];
  }

  return { resolveVariants };
}

module.exports = { createCatalogClient };
