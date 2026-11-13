import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../src/domain/errors.js';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { mergeSort } from '../src/domain/sorting.js';

const events = [
  {
    id: 'lagos-tech',
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Landmark Centre',
    startsAt: '2026-12-05T17:00:00.000Z',
    minPriceCents: 300000,
    seatsLeft: 20,
    tierCount: 1
  },
  {
    id: 'abuja-jazz',
    title: 'Abuja Jazz Night',
    city: 'Abuja',
    venue: 'Jazz Hall',
    startsAt: '2026-12-05T19:00:00.000Z',
    minPriceCents: 100000,
    seatsLeft: 10,
    tierCount: 1
  },
  {
    id: 'lagos-art',
    title: 'Lagos Art Fair',
    city: 'Lagos',
    venue: 'City Gallery',
    startsAt: '2026-12-06T09:00:00.000Z',
    minPriceCents: 900000,
    seatsLeft: 0,
    tierCount: 1
  },
  {
    id: 'no-tiers',
    title: 'Free Exhibition',
    city: 'Lagos',
    venue: 'Museum',
    startsAt: '2026-12-04T10:00:00.000Z',
    minPriceCents: null,
    seatsLeft: 0,
    tierCount: 0
  }
];

const titles = (list) => list.map((event) => event.title);
const assertCode = (action, code) =>
  assert.throws(action, (error) => error instanceof DomainError && error.code === code);

describe('event search and sort', () => {
  it('S05: searches title and venue text without case sensitivity', () => {
    assert.deepEqual(titles(filterEvents(events, { q: 'JAZZ' })), ['Abuja Jazz Night']);
    assert.deepEqual(titles(filterEvents(events, { q: 'MUSEUM' })), ['Free Exhibition']);
  });

  it('S05: filters by exact city, ignoring case', () => {
    assert.deepEqual(titles(filterEvents(events, { city: 'lagos' })), [
      'Lagos Tech Meetup',
      'Lagos Art Fair',
      'Free Exhibition'
    ]);
  });

  it('filters sold-out events when onlyAvailable is enabled', () => {
    assert.deepEqual(titles(filterEvents(events, { onlyAvailable: true })), [
      'Lagos Tech Meetup',
      'Abuja Jazz Night'
    ]);
  });

  it('S05: filters by cheapest tier price and sorts the remaining events cheapest first', () => {
    assert.deepEqual(titles(searchEvents(events, { maxPriceCents: 300000 }, 'price')), [
      'Abuja Jazz Night',
      'Lagos Tech Meetup'
    ]);
  });

  it('S05: sorts by date and orders same-day events by title then id', () => {
    assert.deepEqual(titles(sortEvents(events, 'date')), [
      'Free Exhibition',
      'Abuja Jazz Night',
      'Lagos Tech Meetup',
      'Lagos Art Fair'
    ]);
  });

  it('uses id as the final tie-breaker for every sort option', () => {
    const tied = [
      { ...events[0], id: 'z', title: 'Same' },
      {
        ...events[1],
        id: 'a',
        title: 'Same',
        startsAt: events[0].startsAt,
        minPriceCents: events[0].minPriceCents,
        seatsLeft: events[0].seatsLeft
      }
    ];
    for (const sortBy of ['date', 'price', 'availability']) {
      assert.deepEqual(sortEvents(tied, sortBy).map((event) => event.id), ['a', 'z']);
    }
  });

  it('S05: includes all events on the inclusive date-only upper-bound day', () => {
    assert.deepEqual(titles(filterEvents(events, { to: '2026-12-05' })), [
      'Lagos Tech Meetup',
      'Abuja Jazz Night',
      'Free Exhibition'
    ]);
  });

  it('S05: rejects invalid dates, fractional prices, and unknown sorts with VALIDATION', () => {
    assertCode(() => filterEvents(events, { from: '2026-02-30' }), 'VALIDATION');
    assertCode(() => filterEvents(events, { maxPriceCents: 10.5 }), 'VALIDATION');
    assertCode(() => sortEvents(events, 'popularity'), 'VALIDATION');
    assertCode(() => sortEvents(events, Symbol('unsupported')), 'VALIDATION');
  });

  it('S05: filtering and sorting return new lists without changing the source', () => {
    const original = structuredClone(events);
    const filtered = filterEvents(events, { city: 'lagos' });
    const sorted = sortEvents(events, 'price');

    assert.notEqual(filtered, events);
    assert.notEqual(sorted, events);
    assert.deepEqual(events, original);
  });

  it('S05: filters by inclusive date bounds, maximum price, and availability together', () => {
    assert.deepEqual(titles(filterEvents(events, {
      from: '2026-12-05',
      to: '2026-12-05',
      maxPriceCents: 300000,
      onlyAvailable: true
    })), ['Lagos Tech Meetup', 'Abuja Jazz Night']);
  });

  it('handles empty lists for filtering, sorting, and combined searches', () => {
    assert.deepEqual(filterEvents([], { q: 'x' }), []);
    assert.deepEqual(sortEvents([], 'availability'), []);
    assert.deepEqual(searchEvents([], {}, 'date'), []);
  });

  it('mergeSort returns a stable, new ordering without mutating its input', () => {
    const input = [
      { key: 2, order: 'first-two' },
      { key: 1, order: 'one' },
      { key: 2, order: 'second-two' }
    ];
    const sorted = mergeSort(input, (left, right) => left.key - right.key);

    assert.notEqual(sorted, input);
    assert.deepEqual(sorted.map((item) => item.order), ['one', 'first-two', 'second-two']);
    assert.deepEqual(input.map((item) => item.order), ['first-two', 'one', 'second-two']);
  });

  it('sorts by price with events that have no tiers last', () => {
    assert.deepEqual(titles(sortEvents(events, 'price')), [
      'Abuja Jazz Night',
      'Lagos Tech Meetup',
      'Lagos Art Fair',
      'Free Exhibition'
    ]);
  });

  it('sorts by availability with the most seats first and title tie-breaks', () => {
    const equalAvailability = [
      { ...events[0], seatsLeft: 5, title: 'Zulu' },
      { ...events[1], seatsLeft: 5, title: 'Alpha' }
    ];
    assert.deepEqual(titles(sortEvents(equalAvailability, 'availability')), ['Alpha', 'Zulu']);
  });
});
