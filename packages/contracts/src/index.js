const { z } = require('zod');

const EVENT_TYPES = Object.freeze({
  USER_REGISTERED: 'identity.user.registered.v1',
  USER_ROLE_CHANGED: 'identity.user.role_changed.v1',
  PAYMENT_COMPLETED: 'payment.checkout.completed.v1',
  PAYMENT_FAILED: 'payment.checkout.failed.v1',
  PAYMENT_EXPIRED: 'payment.checkout.expired.v1',
  PAYMENT_CANCELLED: 'payment.checkout.cancelled.v1',
  ORDER_PAID: 'order.paid.v1',
  ORDER_CANCELLED: 'order.cancelled.v1',
  SELLER_RATING_CHANGED: 'moderation.seller_rating.changed.v1',
});

const uuid = z.string().uuid();

const EventEnvelopeSchema = z.object({
  event_id: uuid,
  event_type: z.enum(Object.values(EVENT_TYPES)),
  event_version: z.number().int().positive().default(1),
  producer: z.string().min(1),
  occurred_at: z.string().datetime(),
  correlation_id: uuid,
  causation_id: uuid.nullable().default(null),
  payload: z.record(z.string(), z.unknown()),
});

const CartItemSnapshotSchema = z.object({
  cart_item_id: uuid,
  variant_id: uuid,
  product_id: uuid,
  seller_id: uuid,
  seller_user_id: uuid.optional(),
  product_name: z.string().min(1),
  size_name: z.string().min(1),
  seller_name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  image_url: z.string().nullable().optional(),
  pickup_point_id: uuid.optional(),
  pickup_point: z.object({
    id: uuid.optional(),
    name: z.string().min(1),
    address_line: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    postal_code: z.string().optional(),
    reference: z.string().nullable().optional(),
  }).nullable().optional(),
  pickup_schedules: z.array(z.object({
    id: uuid.optional(),
    day_of_week: z.number().int().min(1).max(7),
    start_time: z.string().min(1),
    end_time: z.string().min(1),
    timezone: z.string().default('America/Monterrey'),
  })).optional(),
});

const CartSnapshotSchema = z.object({
  cart_id: uuid,
  buyer_id: uuid,
  items: z.array(CartItemSnapshotSchema),
});

const InventoryReservationRequestSchema = z.object({
  order_id: uuid,
  buyer_id: uuid,
  expires_at: z.string().datetime(),
  items: z.array(z.object({
    variant_id: uuid,
    quantity: z.number().int().positive(),
  })).min(1),
});

const PaymentCheckoutRequestSchema = z.object({
  order_id: uuid,
  order_number: z.string().min(1),
  buyer_id: uuid,
  amount_cents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  expires_at: z.string().datetime(),
  items: z.array(z.object({
    product_name: z.string().min(1),
    size_name: z.string().min(1),
    quantity: z.number().int().positive(),
    unit_price_cents: z.number().int().nonnegative(),
  })).min(1),
});

module.exports = {
  EVENT_TYPES,
  EventEnvelopeSchema,
  CartSnapshotSchema,
  InventoryReservationRequestSchema,
  PaymentCheckoutRequestSchema,
};
