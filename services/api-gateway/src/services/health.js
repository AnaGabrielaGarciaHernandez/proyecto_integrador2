async function checkServices(targets, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 2000;
  const entries = await Promise.all(
    Object.entries(targets).map(async ([name, target]) => {
      const started = Date.now();
      try {
        const response = await fetchImpl(new URL('/health/ready', target), {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json' },
        });
        const body = await response.json().catch(() => null);
        return [name, {
          ok: response.ok && body?.ok !== false,
          status: response.status,
          duration_ms: Date.now() - started,
        }];
      } catch (error) {
        return [name, {
          ok: false,
          status: null,
          duration_ms: Date.now() - started,
          error: error.name === 'TimeoutError' ? 'timeout' : 'unavailable',
        }];
      }
    }),
  );
  const services = Object.fromEntries(entries);
  return {
    ok: Object.values(services).every((service) => service.ok),
    services,
  };
}

module.exports = { checkServices };
