# Build 3 Architecture

## Layers

```mermaid
flowchart TD
  Routes[HTTP routes] --> Services[Services]
  Services --> Rules[Domain rules]
  Services --> Repositories[Repositories]
  Repositories --> Data[(Database / in-memory data)]
```

Routes may translate HTTP requests and responses, but may not implement business rules or access data directly.

Services may coordinate domain rules and repositories, but may not depend on HTTP details or make persistence decisions themselves.

Domain rules may validate and compute business outcomes, but may not perform HTTP, filesystem, or database I/O.

Repositories may read and write data, but may not decide business policy or call services and routes.

## Data Model

```mermaid
erDiagram
  USERS ||--o{ BOOKINGS : makes
  EVENTS ||--|{ TICKET_TIERS : offers
  EVENTS ||--o{ BOOKINGS : receives
  TICKET_TIERS ||--o{ BOOKINGS : reserves
  USERS {
    string id
    string name
    string email
  }
  EVENTS {
    string id
    string title
    string city
    datetime startsAt
  }
  TICKET_TIERS {
    string id
    string eventId
    string name
    integer capacity
    integer priceCents
  }
  BOOKINGS {
    string id
    string userId
    string eventId
    string tierId
    integer quantity
    integer totalCents
    string status
  }
```

## Booking Life Cycle

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> paid
  pending --> cancelled
  paid --> checked_in
  paid --> refunded
  paid --> cancelled
  cancelled --> [*]
  refunded --> [*]
  checked_in --> [*]
```