const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { createHttpError } = require('@ecobazar/platform');
const { IMAGE_MIME_TYPES } = require('../services/product-images');
const {
  EDITABLE_STATUSES,
  addSellerProductImages,
  createSellerProduct,
  deleteSellerProductImage,
  getSellerProduct,
  listSellerProducts,
  reorderSellerProductImages,
  setSellerProductCover,
  updateSellerProduct,
  updateSellerProductStatus,
} = require('../services/seller-products');
const {
  createSellerPickupPoint,
  listSellerPickupPoints,
  updateSellerPickupPoint,
  updateSellerPickupPointStatus,
} = require('../services/pickup-points');

const PRODUCT_STATUS_VALUES = ['draft', 'active', 'paused', 'sold', 'removed'];
const sellerProductsQuery = z.object({
  search: z.string().trim().max(120).default(''),
  status: z.union([z.enum(PRODUCT_STATUS_VALUES), z.literal('')]).optional().transform((value) => value || undefined),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const uuidSchema = z.string().uuid();

function createSellerRouter({ db, config = {}, storage, mutationRateLimit } = {}) {
  const router = express.Router();
  const imageUpload = createImageUpload(config);
  const mutate = mutationRateLimit ? [mutationRateLimit] : [];

  router.use(requireSeller);

  router.get('/pickup-points', async (req, res, next) => {
    try {
      res.json(await listSellerPickupPoints(db, req.user));
    } catch (error) {
      next(error);
    }
  });

  router.post('/pickup-points', ...mutate, async (req, res, next) => {
    try {
      const pickupPoint = await createSellerPickupPoint(db, req.user, req.body);
      res.status(201).json({ pickup_point: pickupPoint });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/pickup-points/:id/status', ...mutate, async (req, res, next) => {
    try {
      const pointId = parseUuid(req.params.id, 'El punto de venta no es válido.');
      const input = parse(
        z.object({ is_active: z.boolean() }),
        req.body,
        'El estado del punto no es válido.',
      );
      const pickupPoint = await updateSellerPickupPointStatus(
        db,
        req.user,
        pointId,
        input.is_active,
      );
      res.json({ pickup_point: pickupPoint });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/pickup-points/:id', ...mutate, async (req, res, next) => {
    try {
      const pointId = parseUuid(req.params.id, 'El punto de venta no es válido.');
      const pickupPoint = await updateSellerPickupPoint(db, req.user, pointId, req.body);
      res.json({ pickup_point: pickupPoint });
    } catch (error) {
      next(error);
    }
  });

  router.get('/products', async (req, res, next) => {
    try {
      const input = parse(sellerProductsQuery, req.query, 'Parámetros de publicaciones no válidos.');
      res.json(await listSellerProducts(db, req.user, input));
    } catch (error) {
      next(error);
    }
  });

  router.post('/products', ...mutate, parseImages(imageUpload), async (req, res, next) => {
    try {
      const product = await createSellerProduct(db, storage, config, req.user, req.body, req.files);
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/products/:id/status', ...mutate, async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const input = parse(
        z.object({ status: z.enum(EDITABLE_STATUSES) }),
        req.body,
        'El estado de publicación no es válido.',
      );
      const product = await updateSellerProductStatus(db, storage, req.user, productId, input.status);
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/products/:id/images/order', ...mutate, async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const imageIds = parse(
        z.object({ image_ids: z.array(uuidSchema).min(1).max(8) }),
        req.body,
        'El orden de imágenes no es válido.',
      ).image_ids;
      const product = await reorderSellerProductImages(db, req.user, productId, imageIds);
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/products/:id/images/:imageId/cover', ...mutate, async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const imageId = parseUuid(req.params.imageId, 'La imagen no es válida.');
      const product = await setSellerProductCover(db, req.user, productId, imageId);
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.post('/products/:id/images', ...mutate, parseImages(imageUpload), async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const product = await addSellerProductImages(db, storage, config, req.user, productId, req.files);
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/products/:id/images/:imageId', ...mutate, async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const imageId = parseUuid(req.params.imageId, 'La imagen no es válida.');
      const product = await deleteSellerProductImage(db, storage, req.user, productId, imageId);
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/products/:id', ...mutate, async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const product = await updateSellerProduct(db, req.user, productId, req.body);
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.get('/products/:id', async (req, res, next) => {
    try {
      const productId = parseUuid(req.params.id, 'La publicación no es válida.');
      const product = await getSellerProduct(db, req.user, productId);
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function requireSeller(req, res, next) {
  void res;
  const userId = req.get('x-user-id');
  if (!isUuid(userId)) return next(createHttpError('Authentication required', 401));
  if (!['vendedor', 'admin'].includes(req.get('x-user-role'))) {
    return next(createHttpError('Forbidden', 403));
  }
  req.user = { id: userId, role: req.get('x-user-role') };
  return next();
}

function createImageUpload(config = {}) {
  const maxFiles = Number(config.PRODUCT_IMAGE_MAX_FILES || 8);
  const maxInputBytes = Number(config.PRODUCT_IMAGE_MAX_INPUT_BYTES || 8 * 1024 * 1024);
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxInputBytes,
      files: maxFiles,
      fields: 8,
      parts: maxFiles + 8,
      fieldNameSize: 60,
      fieldSize: 64 * 1024,
    },
    fileFilter(req, file, callback) {
      void req;
      if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
        callback(createHttpError(
          'Las imágenes deben ser JPEG, PNG o WebP.',
          415,
          { code: 'PRODUCT_IMAGE_TYPE_NOT_ALLOWED' },
        ));
        return;
      }
      callback(null, true);
    },
  });
}

function parseImages(upload) {
  return (req, res, next) => {
    if (!req.is?.('multipart/form-data')) {
      return next(createHttpError(
        'La publicación debe enviarse como multipart/form-data.',
        415,
        { code: 'PRODUCT_MULTIPART_REQUIRED' },
      ));
    }
    return upload.array('images')(req, res, (error) => {
      if (!error) return next();
      return next(normalizeMultipartError(error));
    });
  };
}

function normalizeMultipartError(error) {
  if (error.status) return error;
  if (error instanceof multer.MulterError) {
    const details = {
      LIMIT_FILE_SIZE: ['Cada imagen no puede superar 8 MB.', 'PRODUCT_IMAGE_INPUT_TOO_LARGE'],
      LIMIT_FILE_COUNT: ['La publicación tiene demasiadas imágenes.', 'PRODUCT_IMAGE_COUNT_EXCEEDED'],
      LIMIT_UNEXPECTED_FILE: ['Las imágenes deben enviarse en el campo images.', 'PRODUCT_MULTIPART_FILE_INVALID'],
      LIMIT_PART_COUNT: ['La publicación contiene demasiados campos.', 'PRODUCT_MULTIPART_PART_COUNT'],
      LIMIT_FIELD_COUNT: ['La publicación contiene demasiados campos.', 'PRODUCT_MULTIPART_FIELD_COUNT'],
    }[error.code];
    if (details) return createHttpError(details[0], error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, { code: details[1] });
  }
  return error;
}

function parse(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createHttpError(message, 400, {
      code: 'INVALID_REQUEST',
      issues: result.error.issues,
    });
  }
  return result.data;
}

function parseUuid(value, message) {
  return parse(uuidSchema, value, message);
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Kept as a named compatibility helper for older integrations. The router no
// longer installs this placeholder: unknown seller routes now return 404.
function sellerPending(req, res, next) {
  void req;
  void res;
  next(createHttpError('Seller endpoints are not implemented yet', 501));
}

module.exports = { createSellerRouter, requireSeller, sellerPending };
