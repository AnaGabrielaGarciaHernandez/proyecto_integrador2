const sharp = require('sharp');
const { createHttpError } = require('@ecobazar/platform');

const AVATAR_ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const AVATAR_FORMAT_BY_MIME = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
});
const AVATAR_MAX_INPUT_DIMENSION = 4096;
const DEFAULT_AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
const DEFAULT_AVATAR_MAX_OUTPUT_BYTES = 300 * 1024;
const DEFAULT_AVATAR_OUTPUT_SIZE = 256;
const DEFAULT_AVATAR_MAX_PIXELS = 16 * 1000 * 1000;
const AVATAR_QUALITIES = Object.freeze([82, 72, 62, 52, 42]);

function createAvatarProcessor(config = {}) {
  const options = {
    maxInputBytes: config.AVATAR_MAX_INPUT_BYTES || DEFAULT_AVATAR_MAX_INPUT_BYTES,
    maxOutputBytes: config.AVATAR_MAX_OUTPUT_BYTES || DEFAULT_AVATAR_MAX_OUTPUT_BYTES,
    outputSize: config.AVATAR_OUTPUT_SIZE || DEFAULT_AVATAR_OUTPUT_SIZE,
    maxPixels: config.AVATAR_MAX_PIXELS || DEFAULT_AVATAR_MAX_PIXELS,
  };

  return (file) => processAvatar(file, options);
}

async function processAvatar(file, options = {}) {
  const maxInputBytes = options.maxInputBytes || DEFAULT_AVATAR_MAX_INPUT_BYTES;
  const maxOutputBytes = options.maxOutputBytes || DEFAULT_AVATAR_MAX_OUTPUT_BYTES;
  const outputSize = options.outputSize || DEFAULT_AVATAR_OUTPUT_SIZE;
  const maxPixels = options.maxPixels || DEFAULT_AVATAR_MAX_PIXELS;

  validateUploadMetadata(file, maxInputBytes);

  let metadata;
  try {
    // Reading metadata without a pixel limit lets us return the precise dimensions
    // error before asking libvips to decode a potentially dangerous image.
    metadata = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: false,
    }).metadata();
  } catch {
    throw avatarError('La imagen está dañada o no es compatible.', 400, 'AVATAR_INVALID_IMAGE');
  }

  const expectedFormat = AVATAR_FORMAT_BY_MIME[file.mimetype];
  if (metadata.format !== expectedFormat) {
    throw avatarError(
      'El contenido de la imagen no coincide con su tipo MIME.',
      415,
      'AVATAR_CONTENT_MISMATCH',
    );
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) {
    throw avatarError('La imagen no tiene dimensiones válidas.', 400, 'AVATAR_INVALID_DIMENSIONS');
  }
  if (width > AVATAR_MAX_INPUT_DIMENSION || height > AVATAR_MAX_INPUT_DIMENSION) {
    throw avatarError(
      `La imagen no puede superar ${AVATAR_MAX_INPUT_DIMENSION} px por lado.`,
      413,
      'AVATAR_DIMENSIONS_TOO_LARGE',
    );
  }
  if (width * height > maxPixels) {
    throw avatarError(
      'La imagen tiene demasiados píxeles.',
      413,
      'AVATAR_PIXELS_TOO_MANY',
    );
  }

  for (const quality of AVATAR_QUALITIES) {
    try {
      const buffer = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: maxPixels,
      })
        .rotate()
        .resize(outputSize, outputSize, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({ quality })
        .toBuffer();

      if (buffer.length <= maxOutputBytes) {
        return {
          buffer,
          contentType: 'image/webp',
          width: outputSize,
          height: outputSize,
          quality,
        };
      }
    } catch {
      throw avatarError('La imagen está dañada o no es compatible.', 400, 'AVATAR_INVALID_IMAGE');
    }
  }

  throw avatarError(
    'La imagen procesada supera el tamaño máximo permitido.',
    413,
    'AVATAR_OUTPUT_TOO_LARGE',
  );
}

function validateUploadMetadata(file, maxInputBytes) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw avatarError('Debes enviar un archivo de avatar.', 400, 'AVATAR_FILE_REQUIRED');
  }
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw avatarError(
      'El avatar debe ser JPEG, PNG o WebP.',
      415,
      'AVATAR_TYPE_NOT_ALLOWED',
    );
  }
  if (file.buffer.length > maxInputBytes || Number(file.size || 0) > maxInputBytes) {
    throw avatarError(
      'El avatar no puede superar los 5 MB.',
      413,
      'AVATAR_INPUT_TOO_LARGE',
    );
  }
}

function avatarError(message, status, code) {
  return createHttpError(message, status, { code });
}

module.exports = {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_FORMAT_BY_MIME,
  AVATAR_MAX_INPUT_DIMENSION,
  AVATAR_QUALITIES,
  DEFAULT_AVATAR_MAX_INPUT_BYTES,
  DEFAULT_AVATAR_MAX_OUTPUT_BYTES,
  DEFAULT_AVATAR_OUTPUT_SIZE,
  DEFAULT_AVATAR_MAX_PIXELS,
  createAvatarProcessor,
  processAvatar,
};
