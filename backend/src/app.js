const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { assertConnection } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const productsRoutes = require('./routes/products.routes');
const cartRoutes = require('./routes/cart.routes');
const adminRoutes = require('./routes/admin.routes');
const sellerRoutes = require('./routes/seller.routes');
const ordersRoutes = require('./routes/orders.routes');
const reviewsRoutes = require('./routes/reviews.routes');
const stripeRoutes = require('./routes/stripe.routes');

const app = express();

app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
  credentials: true,
}));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', async (req, res, next) => {
  try {
    await assertConnection();
    res.json({ ok: true });
  } catch (error) {
    error.message = `Database connection failed: ${error.message}`;
    next(error);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/stripe', stripeRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
