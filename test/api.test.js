import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it } from 'node:test';
import { createApp } from '../src/http/app.js';

async function startServer(context, options) {
  const server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(baseUrl, route, { method = 'GET', userId, body } = {}) {
  const headers = {};
  if (userId) headers['x-user-id'] = userId;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

describe('Build 4 API', () => {
  it('creates, publishes, searches, books, declines, retries payment, and prevents repeat charges', async (context) => {
    let charges = 0;
    const paymentRequests = [];
    const baseUrl = await startServer(context, {
      paymentGateway: {
        async charge(request) {
          charges += 1;
          paymentRequests.push(request);
          return { success: !request.decline };
        }
      }
    });

    const created = await request(baseUrl, '/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'Summer Sounds',
        city: 'Lagos',
        venue: 'City Hall',
        startsAt: '2026-12-05T17:00:00Z'
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'draft');
    const eventId = created.body.id;

    const tier = await request(baseUrl, `/api/events/${eventId}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: { name: 'General', priceCents: 2500, capacity: 3 }
    });
    assert.equal(tier.status, 201);
    assert.equal(tier.body.sold, 0);

    const published = await request(baseUrl, `/api/events/${eventId}/publish`, {
      method: 'POST',
      userId: 'organizer-1'
    });
    assert.equal(published.status, 200);
    assert.equal(published.body.status, 'published');

    const search = await request(baseUrl, '/api/events?q=SUMMER&city=lagos&maxPriceCents=3000&sortBy=price');
    assert.deepEqual(search.body.events.map((event) => event.id), [eventId]);

    const bookingResponse = await request(baseUrl, '/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: { eventId, tierId: tier.body.id, quantity: 2 }
    });
    assert.equal(bookingResponse.status, 201);
    assert.equal(bookingResponse.body.status, 'pending');
    assert.equal(bookingResponse.body.totalCents, 5000);
    const reference = bookingResponse.body.reference;

    const forbiddenPay = await request(baseUrl, `/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-2'
    });
    assert.equal(forbiddenPay.status, 403);
    assert.equal(forbiddenPay.body.error.code, 'FORBIDDEN');
    assert.equal(charges, 0);

    const declined = await request(baseUrl, `/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: { decline: true, cardNumber: 'never-forward-this' }
    });
    assert.equal(declined.status, 402);
    assert.equal(declined.body.error.code, 'PAYMENT_DECLINED');
    assert.deepEqual(paymentRequests, [{ decline: true }]);

    const paid = await request(baseUrl, `/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-1'
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.status, 'paid');

    const repeatedPayment = await request(baseUrl, `/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-1'
    });
    assert.equal(repeatedPayment.status, 409);
    assert.equal(repeatedPayment.body.error.code, 'INVALID_TRANSITION');
    assert.equal(charges, 2);
  });

  it('returns consistent errors and cancels only unpaid bookings', async (context) => {
    const baseUrl = await startServer(context);
    const missingIdentity = await request(baseUrl, '/api/events', {
      method: 'POST',
      body: { title: 'Missing identity', city: 'Lagos', startsAt: '2026-12-05' }
    });
    assert.equal(missingIdentity.status, 400);
    assert.deepEqual(missingIdentity.body.error.code, 'VALIDATION');

    const created = await request(baseUrl, '/api/events', {
      method: 'POST',
      userId: 'organizer',
      body: { title: 'Small Event', city: 'Lagos', startsAt: '2026-12-05' }
    });
    const tier = await request(baseUrl, `/api/events/${created.body.id}/tiers`, {
      method: 'POST',
      userId: 'organizer',
      body: { name: 'General', priceCents: 100, capacity: 1 }
    });
    await request(baseUrl, `/api/events/${created.body.id}/publish`, {
      method: 'POST',
      userId: 'organizer'
    });
    const booked = await request(baseUrl, '/api/bookings', {
      method: 'POST',
      userId: 'attendee',
      body: { eventId: created.body.id, tierId: tier.body.id, quantity: 1 }
    });

    const cancelled = await request(baseUrl, `/api/bookings/${booked.body.reference}/cancel`, {
      method: 'POST',
      userId: 'attendee'
    });
    assert.equal(cancelled.body.status, 'cancelled');

    const payCancelled = await request(baseUrl, `/api/bookings/${booked.body.reference}/pay`, {
      method: 'POST',
      userId: 'attendee'
    });
    assert.equal(payCancelled.status, 409);
    assert.equal(payCancelled.body.error.code, 'INVALID_TRANSITION');

    const invalidSearch = await request(baseUrl, '/api/events?maxPriceCents=1.5');
    assert.equal(invalidSearch.status, 400);
    assert.deepEqual(Object.keys(invalidSearch.body), ['error']);
  });
});
