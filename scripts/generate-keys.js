const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const target = path.resolve(process.env.JWT_KEYS_DIR || path.resolve(__dirname, '../.secrets'));
fs.mkdirSync(target, { recursive: true });

const privateKeyPath = path.join(target, 'jwt-private.pem');
const publicKeyPath = path.join(target, 'jwt-public.pem');
const privateKeyExists = fs.existsSync(privateKeyPath);
const publicKeyExists = fs.existsSync(publicKeyPath);

if (privateKeyExists && publicKeyExists) {
  console.log(`RS256 keys already exist in ${target}; keeping the current key pair`);
  process.exit(0);
}

if (privateKeyExists || publicKeyExists) {
  throw new Error(
    `Incomplete RS256 key pair in ${target}; remove the partial pair before generating new keys`,
  );
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

let privateKeyCreated = false;

try {
  fs.writeFileSync(privateKeyPath, privateKey, { flag: 'wx', mode: 0o600 });
  privateKeyCreated = true;
  fs.writeFileSync(publicKeyPath, publicKey, { flag: 'wx', mode: 0o644 });
} catch (error) {
  if (privateKeyCreated && !fs.existsSync(publicKeyPath)) {
    fs.rmSync(privateKeyPath);
  }
  throw error;
}

console.log(`RS256 keys written to ${privateKeyPath} and ${publicKeyPath}`);
