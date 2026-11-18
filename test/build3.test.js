import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DomainError } from '../src/domain/errors.js';
import { assertTransition, BOOKING_STATES, canTransition } from '../src/domain/bookingStateMachine.js';
import { createApp } from '../src/http/app.js';
import { Router } from '../src/http/router.js';

const allowedTransitions = [
  ['pending', 'paid'],
  ['pending', 'cancelled'],
  ['paid', 'checked_in'],
  ['paid', 'refunded'],
  ['paid', 'cancelled']
];

describe('booking state machine', () => {
  it('accepts every allowed transition', () => {
    assert.deepEqual(BOOKING_STATES, ['pending', 'paid', 'cancelled', 'refunded', 'checked_in']);
    for (const [from, to] of allowedTransitions) {
      assert.equal(canTransition(from, to), true);
      assert.equal(assertTransition(from, to), true);
    }
  });

  it('rejects every transition not explicitly allowed', () => {
    for (const from of BOOKING_STATES) {
      for (const to of BOOKING_STATES) {
        if (allowedTransitions.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to)) {
          continue;
        }
        assert.equal(canTransition(from, to), false, `${from} must not transition to ${to}`);
        assert.throws(
          () => assertTransition(from, to),
          (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION'
        );
      }
    }
    assert.equal(canTransition('unknown', 'paid'), false);
  });
});

describe('HTTP router and app', () => {
  it('matches method and path parameters', () => {
    const router = new Router();
    const handler = () => 'matched';
    router.add('GET', '/events/:eventId/bookings/:bookingId', handler);

    assert.deepEqual(router.match('get', '/events/event%201/bookings/booking-2?view=full'), {
      handler,
      params: { eventId: 'event 1', bookingId: 'booking-2' }
    });
    assert.equal(router.match('POST', '/events/event-1/bookings/booking-2'), null);
    assert.equal(router.match('GET', '/events/event-1'), null);
  });

  it('serves GET /health over HTTP', async (context) => {
    const server = createApp();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    context.after(() => new Promise((resolve) => server.close(resolve)));

    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });

  it('returns consistent JSON errors for bad JSON and unknown API routes', async (context) => {
    const server = createApp();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    context.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const badJson = await fetch(`${baseUrl}/api/example`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), {
      error: { code: 'BAD_JSON', message: 'Request body must contain valid JSON.' }
    });

    const missingRoute = await fetch(`${baseUrl}/api/missing`);
    assert.equal(missingRoute.status, 404);
    assert.deepEqual(await missingRoute.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found.' }
    });

    const apiRoot = await fetch(`${baseUrl}/api`);
    assert.equal(apiRoot.status, 404);
    assert.deepEqual(await apiRoot.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found.' }
    });
  });

  it('serves public files and refuses paths that escape the public directory', async (context) => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'ticketing-static-'));
    const publicDir = path.join(temporaryDirectory, 'public');
    await mkdir(publicDir);
    await writeFile(path.join(publicDir, 'hello.txt'), 'hello');
    await writeFile(path.join(temporaryDirectory, 'secret.txt'), 'secret');

    const server = createApp({ publicDir });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    context.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(temporaryDirectory, { recursive: true, force: true });
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const fileResponse = await fetch(`${baseUrl}/hello.txt`);
    assert.equal(fileResponse.status, 200);
    assert.equal(await fileResponse.text(), 'hello');

    const traversalResponse = await fetch(`${baseUrl}/%2e%2e%2fsecret.txt`);
    assert.equal(traversalResponse.status, 404);
    assert.deepEqual(await traversalResponse.json(), {
      error: { code: 'NOT_FOUND', message: 'Resource not found.' }
    });
  });
});