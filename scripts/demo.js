import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  findBookingByReference,
  joinWaitlist
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const store = createStore();
const event = createEvent(store, { name: 'Summer Sounds' });
const tier = addTier(store, event.id, {
  name: 'General admission',
  capacity: 3,
  priceCents: 2500
});

const adaBooking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: 'Ada',
  quantity: 2
});
console.log(`Ada books 2 of 3 seats (reference ${adaBooking.reference}).`);

try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    customerName: 'Bayo',
    quantity: 2
  });
} catch (error) {
  if (!(error instanceof DomainError) || error.code !== 'SOLD_OUT') {
    throw error;
  }
  console.log(`Bayo's request is refused: ${error.code}.`);
}

const chidiBooking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: 'Chidi',
  quantity: 1
});
console.log(`Chidi books the last seat. The event is sold out.`);
const soldBeforeRefusal = tier.sold;
try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    customerName: 'Femi',
    quantity: 1
  });
  throw new Error('A booking unexpectedly succeeded after the event sold out.');
} catch (error) {
  if (!(error instanceof DomainError) || error.code !== 'SOLD_OUT') {
    throw error;
  }
  console.log(`Femi's booking is refused: ${error.code}.`);
}
if (tier.sold !== soldBeforeRefusal) {
  throw new Error('The refused booking changed the number of sold seats.');
}
console.log(`The refused booking changed no seats (${tier.sold} of ${tier.capacity} remain sold).`);
console.log(`Reference lookup finds ${findBookingByReference(store, chidiBooking.reference).customerName}.`);

joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: 'Dara',
  quantity: 1
});
joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: 'Efe',
  quantity: 1
});
console.log('Dara and Efe join the waitlist.');

const { nextInLine } = cancelBooking(store, adaBooking.reference);
console.log(`Ada cancels. ${nextInLine.customerName} is next in line.`);
