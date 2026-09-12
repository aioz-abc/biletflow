# Backend MVP

Approved scope: JWT accounts, organizer events, ticket inventory, expiring orders,
simulated checkout, QR tickets, owner-scoped lists and check-in.

Use the existing Django/DRF/PostgreSQL deployment. Accounts own authentication;
one ticketing app owns the transactional domain. Lock the event before inventory,
order or check-in changes. Money is integer tiyn. Reservations expire after 15
minutes; availability excludes expired orders without requiring a background job.
Checkout requires an account. A successful order issues one signed QR per ticket.
Owners and platform administrators manage events and check in tickets.

- [x] Add API behavior tests and observe failures.
- [x] Add JWT registration/login/refresh/logout/me with live account checks.
- [x] Add validated event and ticket-type management and migrations.
- [x] Add atomic reservations, idempotent simulated checkout and ticket issuance.
- [x] Add scoped ticket access, QR and atomic check-in.
- [x] Verify PostgreSQL integration, concurrency, migrations and lint.
- [x] Document payloads, runnable demo and deployment boundaries.

No real payment provider or public deployment is included. Existing development
Docker remains the runnable deployment. Email verification is not required to
publish in this pet-project MVP; advanced auth and business features remain planned.
