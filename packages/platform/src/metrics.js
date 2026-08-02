function createMetricsRegistry(serviceName) {
  const requests = new Map();

  function key(method, route, status) {
    return `${method}\u0000${route}\u0000${status}`;
  }

  function observe({ method, route, status, durationMs }) {
    const metricKey = key(method, route, status);
    const current = requests.get(metricKey) || { count: 0, durationMs: 0 };
    current.count += 1;
    current.durationMs += durationMs;
    requests.set(metricKey, current);
  }

  function render() {
    const lines = [
      '# HELP ecobazar_http_requests_total Total HTTP requests handled by the service.',
      '# TYPE ecobazar_http_requests_total counter',
      '# HELP ecobazar_http_request_duration_ms_sum Sum of HTTP request durations in milliseconds.',
      '# TYPE ecobazar_http_request_duration_ms_sum counter',
    ];
    for (const [metricKey, value] of requests) {
      const [method, route, status] = metricKey.split('\u0000');
      const labels = `service="${escapeLabel(serviceName)}",method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"`;
      lines.push(`ecobazar_http_requests_total{${labels}} ${value.count}`);
      lines.push(`ecobazar_http_request_duration_ms_sum{${labels}} ${value.durationMs.toFixed(2)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function middleware(req, res, next) {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const route = (req.route?.path || req.path || 'unknown')
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
        .replace(/\/\d+(?=\/|$)/g, '/:id');
      observe({ method: req.method, route, status: res.statusCode, durationMs });
    });
    next();
  }

  return { middleware, observe, render };
}

function escapeLabel(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

module.exports = { createMetricsRegistry };
