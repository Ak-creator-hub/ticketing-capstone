import { DomainError } from '../domain/errors.js';
import { newId, newReference } from '../domain/ids.js';
import { assertTransition } from '../domain/bookingStateMachine.js';

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireBookingOwner(booking, userId) {
  if (booking.userId !== userId) {
    throw new DomainError('FORBIDDEN', 'Only the attendee who made this booking can change it.');
  }
}

export function createBookingService(repository, paymentGateway) {
  return {
    async createBooking(userId, details) {
      requireNonEmptyString(userId, 'User ID');
      if (details === null || typeof details !== 'object' || Array.isArray(details)) {
        throw new DomainError('VALIDATION', 'Booking request must be an object.');
      }
      const eventId = requireNonEmptyString(details.eventId, 'Event ID');
      const tierId = requireNonEmptyString(details.tierId, 'Ticket tier ID');
      if (!Number.isSafeInteger(details.quantity) || details.quantity < 1 || details.quantity > 10) {
        throw new DomainError('VALIDATION', 'A booking must contain between 1 and 10 tickets.');
      }

      const event = await repository.getEvent(eventId);
      if (!event) throw new DomainError('NOT_FOUND', `Event "${eventId}" was not found.`);
      if (event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'Tickets can only be booked for a published event.');
      }
      const tier = await repository.getTier(tierId);
      if (!tier || tier.eventId !== eventId) {
        throw new DomainError('NOT_FOUND', `Ticket tier "${tierId}" was not found.`);
      }
      if (tier.capacity - tier.sold < details.quantity) {
        throw new DomainError('SOLD_OUT', `Only ${tier.capacity - tier.sold} ticket(s) remain.`);
      }
      const totalCents = tier.priceCents * details.quantity;
      if (!Number.isSafeInteger(totalCents)) {
        throw new DomainError('VALIDATION', 'Booking total must fit in a safe whole number of cents.');
      }

      let reference;
      do {
        reference = newReference();
      } while (await repository.hasBookingReference(reference));

      const booking = {
        id: newId(),
        reference,
        userId,
        eventId,
        tierId,
        quantity: details.quantity,
        totalCents,
        status: 'pending'
      };
      tier.sold += details.quantity;
      await repository.saveTier(tier);
      return repository.saveBooking(booking);
    },

    async pay(reference, userId, shouldDecline = false) {
      requireNonEmptyString(reference, 'Booking reference');
      requireNonEmptyString(userId, 'User ID');
      if (typeof shouldDecline !== 'boolean') {
        throw new DomainError('VALIDATION', 'decline must be a boolean.');
      }

      const booking = await repository.getBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', `Booking "${reference}" was not found.`);
      requireBookingOwner(booking, userId);
      assertTransition(booking.status, 'paid');

      const payment = await paymentGateway.charge({ decline: shouldDecline });
      if (!payment.success) {
        throw new DomainError('PAYMENT_DECLINED', 'The mock payment was declined.');
      }
      booking.status = 'paid';
      return repository.saveBooking(booking);
    },

    async cancel(reference, userId) {
      requireNonEmptyString(reference, 'Booking reference');
      requireNonEmptyString(userId, 'User ID');
      const booking = await repository.getBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', `Booking "${reference}" was not found.`);
      requireBookingOwner(booking, userId);
      assertTransition(booking.status, 'cancelled');

      const tier = await repository.getTier(booking.tierId);
      if (!tier) throw new DomainError('NOT_FOUND', `Ticket tier "${booking.tierId}" was not found.`);
      tier.sold -= booking.quantity;
      booking.status = 'cancelled';
      await repository.saveTier(tier);
      return repository.saveBooking(booking);
    }
  };
}
