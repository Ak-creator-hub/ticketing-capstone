import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addTier,
  bookTickets,
  createEvent,
  createStore,
  listEventSummaries,
  publishEvent,
  cancelBooking,
  unpublishEvent
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const eventDetails = {
  title: 'Summer Sounds',
  city: 'Lagos',
  venue: 'City Hall',
  startsAt: '2026-12-05T17:00:00Z'
};

function assertCode(action, code) {
  assert.throws(action, (error) => error instanceof DomainError && error.code === code);
}

describe('Build 2 event inventory', () => {
  it('S02: creates a new draft that is hidden from the public list', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    const anotherEvent = createEvent(store, { ...eventDetails, title: 'Another Event' });

    assert.ok(event.id);
    assert.notEqual(event.id, anotherEvent.id);
    assert.equal(event.status, 'draft');
    assert.deepEqual(listEventSummaries(store), []);
    assert.equal(listEventSummaries(store, { publishedOnly: false })[0].title, eventDetails.title);
  });

  it('S02: rejects missing title or city and invalid dates without saving', () => {
    const store = createStore();
    for (const invalid of [
      { ...eventDetails, title: '' },
      { ...eventDetails, title: undefined },
      { ...eventDetails, city: ' ' },
      { ...eventDetails, city: undefined },
      { ...eventDetails, startsAt: '2026-02-30T10:00:00Z' },
      { ...eventDetails, startsAt: 'not-a-date' }
    ]) {
      assertCode(() => createEvent(store, invalid), 'VALIDATION');
    }
    assert.equal(store.events.size, 0);
  });

  it('S03: adds a tier with zero tickets sold and the full capacity available', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });

    assert.equal(tier.sold, 0);
    assert.equal(tier.capacity - tier.sold, 100);
    assert.equal(tier.priceCents, 500000);
  });

  it('S03: rejects fractional prices and capacities below one with VALIDATION', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);

    assertCode(() => addTier(store, event.id, { name: 'VIP', priceCents: 199.5, capacity: 5 }), 'VALIDATION');
    assertCode(() => addTier(store, event.id, { name: 'VIP', priceCents: 500, capacity: 0 }), 'VALIDATION');
  });

  it('S03: rejects a tier for an unknown event with NOT_FOUND', () => {
    const store = createStore();
    assertCode(() => addTier(store, 'missing-event', { name: 'General', priceCents: 500, capacity: 5 }), 'NOT_FOUND');
  });

  it('S04: publishes a tiered draft to the public list', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });

    assert.equal(publishEvent(store, event.id).status, 'published');
    assert.deepEqual(listEventSummaries(store).map((summary) => summary.id), [event.id]);
  });

  it('S04: refuses to publish an event without ticket tiers using INVALID_STATE', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);

    assertCode(() => publishEvent(store, event.id), 'INVALID_STATE');
    assert.equal(event.status, 'draft');
    assert.deepEqual(listEventSummaries(store), []);
  });

  it('S04: excludes draft events from the public list', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);

    assert.deepEqual(listEventSummaries(store), []);
    assert.deepEqual(listEventSummaries(store, { publishedOnly: false }).map((summary) => summary.id), [event.id]);
  });

  it('S04: unpublishes an event and removes it from the public list', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
    publishEvent(store, event.id);

    assert.equal(unpublishEvent(store, event.id).status, 'draft');
    assert.deepEqual(listEventSummaries(store), []);
  });

  it('S06: creates a pending booking in cents and decreases seats left', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    const tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
    publishEvent(store, event.id);
    const booking = bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      customerName: 'Ada',
      quantity: 2
    });

    assert.equal(booking.status, 'pending');
    assert.equal(booking.quantity, 2);
    assert.equal(booking.totalCents, 5000);
    assert.equal(tier.capacity - tier.sold, 1);
  });

  it('S06: rejects an oversell with SOLD_OUT and changes no state', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    const tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
    bookTickets(store, { eventId: event.id, tierId: tier.id, customerName: 'Ada', quantity: 2 });
    const bookingsBefore = store.bookings.size;

    assertCode(
      () => bookTickets(store, { eventId: event.id, tierId: tier.id, customerName: 'Bayo', quantity: 2 }),
      'SOLD_OUT'
    );
    assert.equal(tier.sold, 2);
    assert.equal(store.bookings.size, bookingsBefore);
  });

  it('S06: rejects zero, negative, fractional, and over-limit quantities with VALIDATION', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    const tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 20 });

    for (const quantity of [0, -1, 1.5, 11]) {
      assertCode(
        () => bookTickets(store, { eventId: event.id, tierId: tier.id, customerName: 'Ada', quantity }),
        'VALIDATION'
      );
    }
    assert.equal(tier.sold, 0);
  });

  it('retains the Build 1 cancellation rule and reports ALREADY_CANCELLED on a repeat', () => {
    const store = createStore();
    const event = createEvent(store, eventDetails);
    const tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
    const booking = bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      customerName: 'Ada',
      quantity: 2
    });

    cancelBooking(store, booking.reference);
    assert.equal(tier.sold, 0);
    assertCode(() => cancelBooking(store, booking.reference), 'ALREADY_CANCELLED');
    assert.equal(tier.sold, 0);
  });
});
