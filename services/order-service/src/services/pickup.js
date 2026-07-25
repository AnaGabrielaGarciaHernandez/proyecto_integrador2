const TIME_ZONE = 'America/Monterrey';
const PICKUP_DEADLINE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function calculatePickupDeadline(paidAt, days = PICKUP_DEADLINE_DAYS) {
  const date = toDate(paidAt);
  return new Date(date.getTime() + days * DAY_MS);
}

function findNextPickupWindow(schedules, paidAt, deadlineAt = calculatePickupDeadline(paidAt)) {
  const paidDate = toDate(paidAt);
  const deadline = toDate(deadlineAt);
  const localPaid = getLocalParts(paidDate, TIME_ZONE);
  const candidates = [];

  for (let offset = 0; offset <= PICKUP_DEADLINE_DAYS; offset += 1) {
    const localDate = addCalendarDays(localPaid, offset);
    const dayOfWeek = isoWeekday(localDate);
    for (const schedule of Array.isArray(schedules) ? schedules : []) {
      if (Number(schedule?.day_of_week ?? schedule?.dayOfWeek ?? schedule?.day) !== dayOfWeek) continue;
      const startTime = normalizeTime(schedule?.start_time ?? schedule?.startTime ?? schedule?.start);
      const endTime = normalizeTime(schedule?.end_time ?? schedule?.endTime ?? schedule?.end);
      if (!startTime || !endTime || startTime >= endTime) continue;
      const scheduledStart = fromLocalParts(localDate, startTime, TIME_ZONE);
      const scheduledEnd = fromLocalParts(localDate, endTime, TIME_ZONE);
      if (scheduledStart <= paidDate || scheduledStart > deadline || scheduledEnd <= scheduledStart) continue;
      candidates.push({
        scheduledStart,
        scheduledEnd,
        dayOfWeek,
        startTime,
        endTime,
      });
    }
  }

  candidates.sort((left, right) => left.scheduledStart - right.scheduledStart);
  return candidates[0] || null;
}

function getLocalParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(toDate(date))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function fromLocalParts(localDate, time, timeZone) {
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(localDate.year, localDate.month - 1, localDate.day, hour, minute, 0);
  let candidate = new Date(wallClock - getOffsetMilliseconds(new Date(wallClock), timeZone));
  const correctedOffset = getOffsetMilliseconds(candidate, timeZone);
  candidate = new Date(wallClock - correctedOffset);
  return candidate;
}

function getOffsetMilliseconds(date, timeZone) {
  const local = getLocalParts(date, timeZone);
  const wallClock = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return wallClock - date.getTime();
}

function addCalendarDays(localDate, days) {
  const date = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isoWeekday(localDate) {
  const day = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

function normalizeTime(value) {
  const text = String(value ?? '').trim();
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(text);
  return match ? text.slice(0, 5) : null;
}

function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid pickup date');
  return date;
}

module.exports = {
  PICKUP_DEADLINE_DAYS,
  TIME_ZONE,
  calculatePickupDeadline,
  findNextPickupWindow,
};
