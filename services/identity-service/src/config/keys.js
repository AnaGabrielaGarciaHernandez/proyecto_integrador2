const fs = require('node:fs');

function loadPrivateKey(config) {
  return loadPem({
    inlineValue: config.JWT_PRIVATE_KEY,
    filePath: config.JWT_PRIVATE_KEY_FILE || config.JWT_PRIVATE_KEY_PATH,
    label: 'JWT private key',
  });
}

function loadPem({ inlineValue, filePath, label }) {
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
      throw new Error(`${label} could not be read from ${filePath}: ${error.message}`);
    }
  }

  if (inlineValue) return inlineValue.replace(/\\n/g, '\n').trim();
  throw new Error(`${label} is required`);
}

module.exports = { loadPrivateKey };
