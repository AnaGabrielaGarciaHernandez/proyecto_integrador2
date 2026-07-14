const fs = require('node:fs');

function loadPublicKey(config) {
  const filePath = config.JWT_PUBLIC_KEY_FILE || config.JWT_PUBLIC_KEY_PATH;
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
      throw new Error(
        `JWT public key could not be read from ${filePath}: ${error.message}`,
      );
    }
  }
  if (config.JWT_PUBLIC_KEY) return config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n').trim();
  throw new Error('JWT public key is required');
}

module.exports = { loadPublicKey };
