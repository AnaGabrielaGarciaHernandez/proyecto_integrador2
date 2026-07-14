function databaseConfig(env = process.env) {
  const connectionString = env.LEGACY_DATABASE_URL || env.DATABASE_URL;
  if (connectionString) return { connectionString };

  return {
    host: env.POSTGRES_HOST || 'localhost',
    port: Number(env.POSTGRES_PORT || 5432),
    database: env.POSTGRES_DB || 'bd_EcoBazar',
    user: env.POSTGRES_USER || undefined,
    password: env.POSTGRES_PASSWORD || undefined,
  };
}

module.exports = { databaseConfig };
