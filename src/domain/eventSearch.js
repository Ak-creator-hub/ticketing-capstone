import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

function parseDate(value, field, includeEndOfDay = false) {
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
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date.`);
  }
  return includeEndOfDay && dateOnly ? timestamp + 86_400_000 - 1 : timestamp;
}

function compareText(left, right) {
  const normalizedLeft = left.toLocaleLowerCase('en');
  const normalizedRight = right.toLocaleLowerCase('en');
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function compareTitleAndId(left, right) {
  return compareText(left.title, right.title) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function filterEvents(summaries, criteria = {}) {
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;
  if (q !== undefined && typeof q !== 'string') {
    throw new DomainError('VALIDATION', 'q must be a string.');
  }
  if (city !== undefined && typeof city !== 'string') {
    throw new DomainError('VALIDATION', 'city must be a string.');
  }
  const query = q?.trim().toLocaleLowerCase('en');
  const wantedCity = city?.trim().toLocaleLowerCase('en');
  const fromTime = from === undefined ? undefined : parseDate(from, 'from');
  const toTime = to === undefined ? undefined : parseDate(to, 'to', true);
  if (
    maxPriceCents !== undefined &&
    (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)
  ) {
    throw new DomainError('VALIDATION', 'maxPriceCents must be a non-negative whole number of cents.');
  }

  return summaries.filter((event) => {
    if (query && !`${event.title} ${event.venue}`.toLocaleLowerCase('en').includes(query)) return false;
    if (wantedCity && event.city.toLocaleLowerCase('en') !== wantedCity) return false;
    const startsAt = new Date(event.startsAt).getTime();
    if (fromTime !== undefined && startsAt < fromTime) return false;
    if (toTime !== undefined && startsAt > toTime) return false;
    if (maxPriceCents !== undefined && (event.minPriceCents === null || event.minPriceCents > maxPriceCents)) {
      return false;
    }
    if (onlyAvailable && event.seatsLeft <= 0) return false;
    return true;
  });
}

const sorters = {
  date: (left, right) =>
    compareText(left.startsAt.slice(0, 10), right.startsAt.slice(0, 10)) || compareTitleAndId(left, right),
  price: (left, right) => {
    const leftPrice = left.minPriceCents ?? Infinity;
    const rightPrice = right.minPriceCents ?? Infinity;
    return (leftPrice < rightPrice ? -1 : leftPrice > rightPrice ? 1 : 0) || compareTitleAndId(left, right);
  },
  availability: (left, right) => right.seatsLeft - left.seatsLeft || compareTitleAndId(left, right)
};

export function sortEvents(summaries, sortBy = 'date') {
  if (!Object.hasOwn(sorters, sortBy)) {
    throw new DomainError('VALIDATION', `Unknown event sort option: ${String(sortBy)}`);
  }
  return mergeSort(summaries, sorters[sortBy]);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
