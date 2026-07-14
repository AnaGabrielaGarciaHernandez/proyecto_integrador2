const { timingSafeEqual } = require('node:crypto');
const { createHttpError } = require('@ecobazar/platform');

function createRequireInternalToken(csvTokens) {
  const expectedTokens = String(csvTokens || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  return function requireInternalToken(req, res, next) {
    const actual = req.get('x-internal-token') || '';
    const matches = expectedTokens.some((expected) => safeEqual(actual, expected));
    if (!matches) return next(createHttpError('Internal service authentication required', 401));
    return next();
  };
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  return left.length === right.length && timingSafeEqual(left, right);
}

module.exports = { createRequireInternalToken };
