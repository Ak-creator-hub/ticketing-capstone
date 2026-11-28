import { createServer } from 'node:http';
import { realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '../domain/errors.js';
import { createMemoryRepository } from '../repositories/memory.js';
import { createBookingService } from '../services/bookingService.js';
import { createEventService } from '../services/eventService.js';
import { charge } from '../lib/mockPaymentGateway.js';
import { Router } from './router.js';

const MAX_JSON_BYTES = 1_048_576;
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8']
]);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

function errorDetails(error) {
  if (error instanceof HttpError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof DomainError) {
    const statusByCode = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      PAYMENT_DECLINED: 402,
      INVALID_TRANSITION: 409,
      INVALID_STATE: 409,
      SOLD_OUT: 409
    };
    const status = statusByCode[error.code] ?? 400;
    return { status, code: error.code, message: error.message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
}

function jsonResponse(status, body) {
  return { httpStatus: status, body };
}

function userIdFrom(request) {
  const userId = request.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new DomainError('VALIDATION', 'x-user-id header is required.');
  }
  return userId.trim();
}

function registerApiRoutes(router, repository, paymentGateway) {
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, paymentGateway);

  router.add('POST', '/api/events', async ({ request, body }) =>
    jsonResponse(201, await eventService.createEvent(userIdFrom(request), body))
  );
  router.add('POST', '/api/events/:id/tiers', async ({ request, params, body }) =>
    jsonResponse(201, await eventService.addTier(userIdFrom(request), params.id, body))
  );
  router.add('POST', '/api/events/:id/publish', async ({ request, params }) =>
    jsonResponse(200, await eventService.publishEvent(userIdFrom(request), params.id))
  );
  router.add('GET', '/api/events', async ({ url }) => {
    const criteria = Object.fromEntries(url.searchParams.entries());
    const { sortBy = 'date', ...filters } = criteria;
    return jsonResponse(200, { events: await eventService.search({ ...filters, sortBy }) });
  });
  router.add('POST', '/api/bookings', async ({ request, body }) =>
    jsonResponse(201, await bookingService.createBooking(userIdFrom(request), body))
  );
  router.add('POST', '/api/bookings/:reference/pay', async ({ request, params, body }) => {
    if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body))) {
      throw new DomainError('VALIDATION', 'Payment request must be an object.');
    }
    const shouldDecline = body === undefined || body.decline === undefined ? false : body.decline;
    return jsonResponse(200, await bookingService.pay(params.reference, userIdFrom(request), shouldDecline));
  });
  router.add('POST', '/api/bookings/:reference/cancel', async ({ request, params }) =>
    jsonResponse(200, await bookingService.cancel(params.reference, userIdFrom(request)))
  );
}

async function readJsonBody(request) {
  if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
    return undefined;
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_JSON_BYTES) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(chunk);
  }
  if (length === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Request body must contain valid JSON.');
  }
}

function isWithinDirectory(directory, filePath) {
  const relativePath = path.relative(directory, filePath);
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
}

async function serveStatic(request, response, pathname, publicDirectory) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'BAD_PATH', 'Request path is invalid.');
  }
  if (decodedPath.includes('\0')) {
    throw new HttpError(400, 'BAD_PATH', 'Request path is invalid.');
  }

  try {
    const root = await realpath(publicDirectory);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '');
    const candidate = path.resolve(root, relativePath);
    if (!isWithinDirectory(root, candidate)) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    }

    const filePath = await realpath(candidate);
    if (!isWithinDirectory(root, filePath) || !(await stat(filePath)).isFile()) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    }
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
      'content-length': contents.length
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new HttpError(403, 'FORBIDDEN', 'Resource cannot be accessed.');
    }
    throw error;
  }
}

export function createApp({
  publicDir = path.resolve('public'),
  router = new Router(),
  repository = createMemoryRepository(),
  paymentGateway = { charge }
} = {}) {
  registerApiRoutes(router, repository, paymentGateway);

  if (!router.match('GET', '/health')) {
    router.add('GET', '/health', () => ({ status: 'ok' }));
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const body = await readJsonBody(request);
      const route = router.match(request.method, url.pathname);
      if (route) {
        const result = await route.handler({ request, params: route.params, body, url });
        if (result !== null && typeof result === 'object' && Number.isInteger(result.httpStatus) && 'body' in result) {
          sendJson(response, result.httpStatus, result.body);
        } else {
          sendJson(response, 200, result);
        }
        return;
      }
      if (url.pathname === '/health' || url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        sendError(response, 404, 'NOT_FOUND', 'Route not found.');
        return;
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        await serveStatic(request, response, url.pathname, path.resolve(publicDir));
        return;
      }
      sendError(response, 404, 'NOT_FOUND', 'Route not found.');
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const details = errorDetails(error);
      sendError(response, details.status, details.code, details.message);
    }
  });
}