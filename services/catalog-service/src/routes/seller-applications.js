const express = require('express');
const { z } = require('zod');
const { createHttpError } = require('@ecobazar/platform');
const {
  createSellerApplication,
  getLatestSellerApplication,
} = require('../services/seller-applications');

const UuidSchema = z.string().uuid();
const SellerApplicationSchema = z.object({
  requested_display_name: z.string().trim().min(2).max(180),
  contact_phone: z.string().trim().min(7).max(30),
  contact_email: z.string().trim().email().max(255),
  contact_address: z.string().trim().min(3).max(255),
  description: z.string().trim().min(10).max(2000),
});

function createSellerApplicationsRouter(db, { mutationRateLimit } = {}) {
  const router = express.Router();
  const mutationGuard = mutationRateLimit || ((req, res, next) => next());
  router.use(requireApplicationCustomer);

  router.get('/me', async (req, res, next) => {
    try {
      res.json({ application: await getLatestSellerApplication(db, req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', mutationGuard, async (req, res, next) => {
    try {
      const input = parse(SellerApplicationSchema, req.body);
      const application = await createSellerApplication(db, req.user.id, input);
      res.status(201).json({ application });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function requireApplicationCustomer(req, res, next) {
  const id = UuidSchema.safeParse(req.get('x-user-id'));
  if (!id.success) {
    return next(createHttpError('Debes iniciar sesión.', 401, {
      code: 'AUTHENTICATION_REQUIRED',
    }));
  }
  if (req.get('x-user-role') !== 'cliente') {
    return next(createHttpError('Solo las cuentas de cliente pueden solicitar ser vendedor.', 403, {
      code: 'FORBIDDEN',
    }));
  }
  req.user = { id: id.data, role: 'cliente' };
  return next();
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createHttpError('Revisa los datos de la solicitud.', 400, result.error.flatten());
  }
  return result.data;
}

module.exports = {
  createSellerApplicationsRouter,
  requireApplicationCustomer,
};
