function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function createMemoryRepository() {
  const events = new Map();
  const tiers = new Map();
  const bookings = new Map();
  const bookingReferences = new Map();

  return {
    async saveEvent(event) {
      events.set(event.id, copy(event));
      return copy(event);
    },
    async getEvent(id) {
      return copy(events.get(id));
    },
    async listEvents() {
      return [...events.values()].map(copy);
    },
    async saveTier(tier) {
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async getTier(id) {
      return copy(tiers.get(id));
    },
    async listTiersForEvent(eventId) {
      return [...tiers.values()].filter((tier) => tier.eventId === eventId).map(copy);
    },
    async saveBooking(booking) {
      bookings.set(booking.id, copy(booking));
      bookingReferences.set(booking.reference, booking.id);
      return copy(booking);
    },
    async getBookingByReference(reference) {
      const id = bookingReferences.get(reference);
      return id === undefined ? undefined : copy(bookings.get(id));
    },
    async hasBookingReference(reference) {
      return bookingReferences.has(reference);
    }
  };
}
