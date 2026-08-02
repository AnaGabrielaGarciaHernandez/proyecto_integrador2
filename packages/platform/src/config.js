function assertProductionConfig(config, { required = [], httpsUrls = [] } = {}) {
  if (config.NODE_ENV !== 'production') return config;

  const missing = required.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  }

  for (const key of httpsUrls) {
    let parsed;
    try {
      parsed = new URL(String(config[key]));
    } catch {
      throw new Error(`${key} must be a valid URL in production`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`${key} must use HTTPS in production`);
    }
  }

  return config;
}

function assertNotDevelopmentDefault(config, keys) {
  if (config.NODE_ENV !== 'production') return config;

  const invalid = keys.filter((key) => {
    const value = String(config[key] ?? '').toLowerCase();
    return value.includes('change_this') || value.includes('_dev') || value.includes('localhost');
  });

  if (invalid.length > 0) {
    throw new Error(`Development defaults are not allowed in production: ${invalid.join(', ')}`);
  }

  return config;
}

module.exports = {
  assertNotDevelopmentDefault,
  assertProductionConfig,
};
