const { createDb } = require('@ecobazar/platform');
const env = require('./env');

module.exports = createDb({ connectionString: env.DATABASE_URL, schema: 'ordering' });
