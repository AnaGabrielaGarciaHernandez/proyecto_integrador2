const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const {
  calculatePickupDeadline,
  findNextPickupWindow,
} = require('../src/services/pickup');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@ecobazar/platform') {
    return {
      createHttpError(message, status, details) {
        return Object.assign(new Error(message), { status, details });
      },
    };
  }
  return originalLoad(request, parent, isMain);
};
const { createPickupGroups } = require('../src/repositories/orders');
Module._load = originalLoad;

const SCHEDULE = [{
  day_of_week: 2,
  start_time: '10:00',
  end_time: '14:00',
}];

test('pickup windows use America/Monterrey and the seven-day deadline', () => {
  const paidAt = new Date('2030-01-07T18:00:00.000Z');
  const deadline = calculatePickupDeadline(paidAt);
  const window = findNextPickupWindow(SCHEDULE, paidAt, deadline);

  assert.equal(deadline.toISOString(), '2030-01-14T18:00:00.000Z');
  assert.equal(window.scheduledStart.toISOString(), '2030-01-08T16:00:00.000Z');
  assert.equal(window.scheduledEnd.toISOString(), '2030-01-08T20:00:00.000Z');
});

test('pickup groups split by seller and point while sharing matching windows', async () => {
  const statements = [];
  let groupNumber = 0;
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (/INSERT INTO pickup_groups/.test(sql)) {
        groupNumber += 1;
        return { rows: [{ id: `group-${groupNumber}` }] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const point = (id, name) => ({
    id,
    name,
    address_line: 'Calle 1 #2',
    city: 'Durango',
    state: 'Durango',
    postal_code: '34000',
    reference: null,
  });
  const item = (id, sellerUserId, pickupPointId, pickupPoint) => ({
    id,
    seller_user_id: sellerUserId,
    seller_name: sellerUserId === 'seller-a' ? 'Tienda A' : 'Tienda B',
    pickup_point_id: pickupPointId,
    pickup_point: pickupPoint,
    pickup_schedules: SCHEDULE,
  });

  const groups = await createPickupGroups(client, {
    id: 'order-1',
    items: [
      item('item-1', 'seller-a', 'point-1', point('point-1', 'Centro')),
      item('item-2', 'seller-a', 'point-1', point('point-1', 'Centro')),
      item('item-3', 'seller-a', 'point-2', point('point-2', 'Norte')),
      item('item-4', 'seller-b', 'point-1', point('point-1', 'Centro')),
    ],
  }, '2030-01-07T18:00:00.000Z');

  assert.equal(groups.length, 3);
  assert.equal(groupNumber, 3);
  assert.equal(statements.filter(({ sql }) => /INSERT INTO pickup_group_items/.test(sql)).length, 4);
  assert.equal(statements.at(-1).params[0], 'order-1');
  assert.equal(statements.find(({ sql }) => /INSERT INTO pickup_groups/.test(sql)).params[10].toISOString(), '2030-01-08T16:00:00.000Z');
});
