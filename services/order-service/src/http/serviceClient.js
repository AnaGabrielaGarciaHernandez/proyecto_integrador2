const { createHttpError } = require('@ecobazar/platform');

function createServiceClient({ baseUrl, serviceToken, timeoutMs, serviceName }) {
  async function request(path, { method = 'GET', body, correlationId } = {}) {
    let response;
    try {
      response = await fetch(new URL(path, `${baseUrl.replace(/\/$/, '')}/`), {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-token': serviceToken,
          'x-correlation-id': correlationId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const error = createHttpError(`${serviceName} is temporarily unavailable`, 503, {
        code: 'DEPENDENCY_UNAVAILABLE', dependency: serviceName,
      });
      error.cause = cause;
      throw error;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw createHttpError(
        payload.error?.message || `${serviceName} request failed`,
        response.status,
        payload.error?.details,
      );
    }
    return payload;
  }

  return { request };
}

module.exports = { createServiceClient };
