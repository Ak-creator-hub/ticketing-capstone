import { performance } from 'node:perf_hooks';

const BOOKINGS = 100_000;
const LOOKUPS = 500;
const bookings = [];
const bookingsByReference = new Map();

for (let index = 0; index < BOOKINGS; index += 1) {
  const booking = { reference: `BK-${index}`, id: index };
  bookings.push(booking);
  bookingsByReference.set(booking.reference, booking);
}

const references = Array.from(
  { length: LOOKUPS },
  (_, index) => `BK-${BOOKINGS - LOOKUPS + index}`
);

let arrayChecksum = 0;
const arrayStart = performance.now();
for (const reference of references) {
  const booking = bookings.find((candidate) => candidate.reference === reference);
  if (!booking) {
    throw new Error(`Missing benchmark booking: ${reference}`);
  }
  arrayChecksum += booking.id;
}
const arrayMilliseconds = performance.now() - arrayStart;

let mapChecksum = 0;
const mapStart = performance.now();
for (const reference of references) {
  const booking = bookingsByReference.get(reference);
  if (!booking) {
    throw new Error(`Missing benchmark booking: ${reference}`);
  }
  mapChecksum += booking.id;
}
const mapMilliseconds = performance.now() - mapStart;

if (arrayChecksum !== mapChecksum) {
  throw new Error('Array.find and Map.get returned different benchmark results.');
}

console.log(`Bookings: ${BOOKINGS.toLocaleString()} | lookups: ${LOOKUPS.toLocaleString()}`);
console.log(`Array.find: ${arrayMilliseconds.toFixed(3)} ms`);
console.log(`Map.get:    ${mapMilliseconds.toFixed(3)} ms`);
