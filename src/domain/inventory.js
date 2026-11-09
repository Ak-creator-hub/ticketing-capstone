import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${label} must be an object.`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('VALIDATION', `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError('VALIDATION', `${label} must be a positive whole number.`);
  }
}

function requireStore(store) {
  if (
    store === null ||
    typeof store !== 'object' ||
    !(store.events instanceof Map) ||
    !(store.bookings instanceof Map) ||
    !(store.bookingsByReference instanceof Map) ||
    !(store.waitlists instanceof Map)
  ) {
    throw new DomainError('VALIDATION', 'A store created by createStore() is required.');
  }
}

function getEvent(store, eventId) {
  const event = store.events.get(eventId);
  if (!event) {
    throw new DomainError('NOT_FOUND', `Event "${eventId}" was not found.`);
  }
  return event;
}

function getTier(store, eventId, tierId) {
  const event = getEvent(store, eventId);
  const tier = event.tiers.get(tierId);
  if (!tier) {
    throw new DomainError('NOT_FOUND', `Ticket tier "${tierId}" was not found.`);
  }
  return tier;
}

function getWaitlist(store, tierId) {
  let queue = store.waitlists.get(tierId);
  if (!queue) {
    queue = new Queue();
    store.waitlists.set(tierId, queue);
  }
  return queue;
}

export function createStore() {
  return {
    events: new Map(),
    bookings: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map()
  };
}

export function createEvent(store, details) {
  requireStore(store);
  requireRecord(details, 'Event details');
  const name = requireNonEmptyString(details.name, 'Event name');

  const event = {
    id: newId(),
    name,
    tiers: new Map()
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, details) {
  requireStore(store);
  requireNonEmptyString(eventId, 'Event ID');
  requireRecord(details, 'Ticket tier details');
  const name = requireNonEmptyString(details.name, 'Tier name');
  requirePositiveInteger(details.capacity, 'Tier capacity');
  if (!Number.isSafeInteger(details.priceCents) || details.priceCents < 0) {
    throw new DomainError('VALIDATION', 'Ticket price must be a non-negative whole number of cents.');
  }

  const event = getEvent(store, eventId);
  const tier = {
    id: newId(),
    eventId,
    name,
    capacity: details.capacity,
    priceCents: details.priceCents,
    sold: 0
  };
  event.tiers.set(tier.id, tier);
  return tier;
}

export function bookTickets(store, request) {
  requireStore(store);
  requireRecord(request, 'Booking request');
  const eventId = requireNonEmptyString(request.eventId, 'Event ID');
  const tierId = requireNonEmptyString(request.tierId, 'Ticket tier ID');
  const customerName = requireNonEmptyString(request.customerName, 'Customer name');
  if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > 10) {
    throw new DomainError('VALIDATION', 'A booking must contain between 1 and 10 tickets.');
  }

  const tier = getTier(store, eventId, tierId);
  if (tier.capacity - tier.sold < request.quantity) {
    throw new DomainError('SOLD_OUT', `Only ${tier.capacity - tier.sold} ticket(s) remain.`);
  }
  const totalCents = tier.priceCents * request.quantity;
  if (!Number.isSafeInteger(totalCents)) {
    throw new DomainError('VALIDATION', 'Booking total must fit in a safe whole number of cents.');
  }

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    eventId,
    tierId,
    customerName,
    quantity: request.quantity,
    totalCents,
    status: 'active'
  };

  tier.sold += request.quantity;
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function cancelBooking(store, reference) {
  requireStore(store);
  requireNonEmptyString(reference, 'Booking reference');

  const booking = store.bookingsByReference.get(reference);
  if (!booking) {
    throw new DomainError('NOT_FOUND', `Booking "${reference}" was not found.`);
  }
  if (booking.status === 'cancelled') {
    throw new DomainError('ALREADY_CANCELLED', `Booking "${reference}" is already cancelled.`);
  }

  const tier = getTier(store, booking.eventId, booking.tierId);
  booking.status = 'cancelled';
  tier.sold -= booking.quantity;
  return {
    booking,
    nextInLine: store.waitlists.get(booking.tierId)?.peek() ?? null
  };
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  requireNonEmptyString(reference, 'Booking reference');
  return store.bookingsByReference.get(reference) ?? null;
}

export function joinWaitlist(store, request) {
  requireStore(store);
  requireRecord(request, 'Waitlist request');
  const eventId = requireNonEmptyString(request.eventId, 'Event ID');
  const tierId = requireNonEmptyString(request.tierId, 'Ticket tier ID');
  const customerName = requireNonEmptyString(request.customerName, 'Customer name');
  if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > 10) {
    throw new DomainError('VALIDATION', 'A waitlist request must be for between 1 and 10 tickets.');
  }

  getTier(store, eventId, tierId);
  const entry = {
    id: newId(),
    eventId,
    tierId,
    customerName,
    quantity: request.quantity
  };
  getWaitlist(store, tierId).enqueue(entry);
  return entry;
}
