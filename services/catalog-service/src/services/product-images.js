const sharp = require('sharp');
const { createHttpError } = require('@ecobazar/platform');

const IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const FORMAT_BY_MIME = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const OUTPUT_QUALITIES = Object.freeze([84, 76, 68, 60, 52]);

async function processProductImages(files, config = {}) {
  const maxFiles = Number(config.PRODUCT_IMAGE_MAX_FILES || 8);
  const maxInputBytes = Number(config.PRODUCT_IMAGE_MAX_INPUT_BYTES || 8 * 1024 * 1024);
  const maxOutputBytes = Number(config.PRODUCT_IMAGE_MAX_OUTPUT_BYTES || 1.5 * 1024 * 1024);
  const maxPixels = Number(config.PRODUCT_IMAGE_MAX_PIXELS || 25 * 1000 * 1000);
  const maxDimension = Number(config.PRODUCT_IMAGE_MAX_DIMENSION || 6000);

  if (!Array.isArray(files) || files.length === 0) {
    throw imageError('Debes agregar al menos una imagen.', 400, 'PRODUCT_IMAGES_REQUIRED');
  }
  if (files.length > maxFiles) {
    throw imageError(
      `Una publicación puede tener hasta ${maxFiles} imágenes.`,
      400,
      'PRODUCT_IMAGE_COUNT_EXCEEDED',
    );
  }

  const processed = [];
  for (const file of files) {
    processed.push(await processProductImage(file, {
      maxInputBytes,
      maxOutputBytes,
      maxPixels,
      maxDimension,
    }));
  }
  return processed;
}

async function processProductImage(file, options) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw imageError('Cada imagen debe ser un archivo válido.', 400, 'PRODUCT_IMAGE_INVALID');
  }
  if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw imageError('Las imágenes deben ser JPEG, PNG o WebP.', 415, 'PRODUCT_IMAGE_TYPE_NOT_ALLOWED');
  }
  if (file.buffer.length > options.maxInputBytes || Number(file.size || 0) > options.maxInputBytes) {
    throw imageError('Cada imagen no puede superar 8 MB.', 413, 'PRODUCT_IMAGE_INPUT_TOO_LARGE');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: false,
    }).metadata();
  } catch {
    throw imageError('Una de las imágenes está dañada o no es compatible.', 400, 'PRODUCT_IMAGE_INVALID');
  }

  if (metadata.format !== FORMAT_BY_MIME[file.mimetype]) {
    throw imageError(
      'El contenido de una imagen no coincide con su formato declarado.',
      415,
      'PRODUCT_IMAGE_CONTENT_MISMATCH',
    );
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) {
    throw imageError('Una de las imágenes no tiene dimensiones válidas.', 400, 'PRODUCT_IMAGE_INVALID_DIMENSIONS');
  }
  if (width > options.maxDimension || height > options.maxDimension) {
    throw imageError(
      `Las imágenes no pueden superar ${options.maxDimension} px por lado.`,
      413,
      'PRODUCT_IMAGE_DIMENSIONS_TOO_LARGE',
    );
  }
  if (width * height > options.maxPixels) {
    throw imageError('Una de las imágenes tiene demasiados píxeles.', 413, 'PRODUCT_IMAGE_PIXELS_TOO_MANY');
  }

  for (const quality of OUTPUT_QUALITIES) {
    try {
      const buffer = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: options.maxPixels,
      })
        .rotate()
        .resize(2400, 2400, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();

      if (buffer.length <= options.maxOutputBytes) {
        const outputMetadata = await sharp(buffer).metadata();
        return {
          buffer,
          width: Number(outputMetadata.width || 0),
          height: Number(outputMetadata.height || 0),
          contentType: 'image/webp',
          originalName: String(file.originalname || 'imagen').slice(0, 255),
          originalMimeType: file.mimetype,
          quality,
        };
      }
    } catch {
      throw imageError('No se pudo procesar una de las imágenes.', 400, 'PRODUCT_IMAGE_PROCESSING_FAILED');
    }
  }

  throw imageError(
    'Una de las imágenes procesadas supera el tamaño máximo permitido.',
    413,
    'PRODUCT_IMAGE_OUTPUT_TOO_LARGE',
  );
}

function imageError(message, status, code) {
  return createHttpError(message, status, { code });
}

module.exports = {
  FORMAT_BY_MIME,
  IMAGE_MIME_TYPES,
  processProductImage,
  processProductImages,
};
