# Build 4 API examples

Start the server with `npm start`. These examples use a local server and identify
the caller with `x-user-id`; replace the example ids as needed.

## Create an event

```sh
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{"title":"Summer Sounds","city":"Lagos","venue":"City Hall","startsAt":"2026-12-05T17:00:00Z"}'
```

Add a tier to the created event:

```sh
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{"name":"General","priceCents":2500,"capacity":100}'
```

## Publish an event

```sh
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish \
  -H "x-user-id: organizer-1"
```

## Search events

```sh
curl "http://localhost:3000/api/events?q=sounds&city=lagos&maxPriceCents=3000&onlyAvailable=true&sortBy=price"
```

## Book tickets

```sh
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{"eventId":"EVENT_ID","tierId":"TIER_ID","quantity":2}'
```

## Pay for a booking

```sh
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{"decline":false}'
```

To simulate a declined payment, set `"decline":true`; the booking stays pending
and can be retried.

## Cancel an unpaid booking

```sh
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/cancel \
  -H "x-user-id: attendee-1"
```
