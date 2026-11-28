import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { searchEvents as searchDomainEvents } from '../domain/eventSearch.js';

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${label} must be an object.`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeIsoDate(value) {
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const [year, month, day] = dateOnly || dateTime ? value.slice(0, 10).split('-').map(Number) : [];
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const timestamp = new Date(value).getTime();
  if (
    (!dateOnly && !dateTime) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthLengths[month - 1] ||
    Number.isNaN(timestamp)
  ) {
    throw new DomainError('VALIDATION', 'Event date must be a valid ISO date.');
  }
  return new Date(timestamp).toISOString();
}

function parseSearchCriteria(criteria) {
  requireRecord(criteria, 'Search criteria');
  const parsed = { ...criteria };
  if (typeof parsed.maxPriceCents === 'string') {
    if (!/^\d+$/.test(parsed.maxPriceCents)) {
      throw new DomainError('VALIDATION', 'maxPriceCents must be a non-negative whole number of cents.');
    }
    parsed.maxPriceCents = Number(parsed.maxPriceCents);
  }
  if (typeof parsed.onlyAvailable === 'string') {
    if (parsed.onlyAvailable !== 'true' && parsed.onlyAvailable !== 'false') {
      throw new DomainError('VALIDATION', 'onlyAvailable must be true or false.');
    }
    parsed.onlyAvailable = parsed.onlyAvailable === 'true';
  }
  if (parsed.onlyAvailable !== undefined && typeof parsed.onlyAvailable !== 'boolean') {
    throw new DomainError('VALIDATION', 'onlyAvailable must be true or false.');
  }
  return parsed;
}

export function createEventService(repository) {
  async function getOwnedEvent(eventId, userId) {
    const event = await repository.getEvent(eventId);
    if (!event) throw new DomainError('NOT_FOUND', `Event "${eventId}" was not found.`);
    if (event.organizerId !== userId) {
      throw new DomainError('FORBIDDEN', 'Only the event organizer can change this event.');
    }
    return event;
  }

  return {
    async createEvent(userId, details) {
      requireNonEmptyString(userId, 'User ID');
      requireRecord(details, 'Event details');
      const title = requireNonEmptyString(details.title, 'Event title');
      const city = requireNonEmptyString(details.city, 'Event city');
      const venue = details.venue === undefined ? '' : details.venue;
      if (typeof venue !== 'string') {
        throw new DomainError('VALIDATION', 'Event venue must be a string.');
      }

      const event = {
        id: newId(),
        organizerId: userId,
        title,
        city,
        venue: venue.trim(),
        startsAt: normalizeIsoDate(details.startsAt),
        status: 'draft'
      };
      return repository.saveEvent(event);
    },

    async addTier(userId, eventId, details) {
      requireNonEmptyString(userId, 'User ID');
      requireNonEmptyString(eventId, 'Event ID');
      requireRecord(details, 'Ticket tier details');
      const name = requireNonEmptyString(details.name, 'Tier name');
      if (!Number.isSafeInteger(details.capacity) || details.capacity < 1) {
        throw new DomainError('VALIDATION', 'Tier capacity must be a positive whole number.');
      }
      if (!Number.isSafeInteger(details.priceCents) || details.priceCents < 0) {
        throw new DomainError('VALIDATION', 'Ticket price must be a non-negative whole number of cents.');
      }

      await getOwnedEvent(eventId, userId);
      const tier = {
        id: newId(),
        eventId,
        name,
        capacity: details.capacity,
        priceCents: details.priceCents,
        sold: 0
      };
      return repository.saveTier(tier);
    },

    async publishEvent(userId, eventId) {
      requireNonEmptyString(userId, 'User ID');
      requireNonEmptyString(eventId, 'Event ID');
      const event = await getOwnedEvent(eventId, userId);
      if ((await repository.listTiersForEvent(eventId)).length === 0) {
        throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing.');
      }
      event.status = 'published';
      return repository.saveEvent(event);
    },

    async search(criteria) {
      const parsedCriteria = parseSearchCriteria(criteria);
      const events = await repository.listEvents();
      const summaries = [];
      for (const event of events) {
        if (event.status !== 'published') continue;
        const tiers = await repository.listTiersForEvent(event.id);
        summaries.push({
          id: event.id,
          title: event.title,
          city: event.city,
          venue: event.venue,
          startsAt: event.startsAt,
          status: event.status,
          tierCount: tiers.length,
          minPriceCents: tiers.length ? Math.min(...tiers.map((tier) => tier.priceCents)) : null,
          seatsLeft: tiers.reduce((total, tier) => total + tier.capacity - tier.sold, 0)
        });
      }
      return searchDomainEvents(summaries, parsedCriteria, criteria.sortBy ?? 'date');
    }
  };
}
