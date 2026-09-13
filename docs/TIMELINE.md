# BiletFlow — 10-Week Delivery Timeline

Start: Sep 8, 2026 · Deadline: Nov 16, 2026 · Stack: Django + DRF + PostgreSQL
(backend), React + Tailwind (one shared frontend), React Native (mobile), Docker.

Report checkpoints: **Sep 14 · Sep 28 · Oct 12 · Oct 26 · Nov 9 · Nov 16 (final)**

## Ownership

| # | Person | Owns |
|---|--------|------|
| 1 | Nursat | Architecture, auth, roles, deployment, integration |
| 2 | Aizhan | Event/ticket/order/seat-reservation backend services |
| 3 | Anvar | Organizer + attendee web interfaces |
| 4 | Abylai | React Native check-in app, support workflow, automated testing, release coordination |
| 5 | Mirat | Admin interface, promo campaigns, reporting, org. history, printable tickets |

Ownership doesn't mean working alone — agree on the API contract before
building in parallel, and review each other's PRs where you can.

## Phase-by-Phase (team view — see your own file for your specific tasks)

| Phase | Dates | Focus | Report |
|-------|-------|-------|--------|
| 1 | Sep 8–14 | Stack finalized, wireframes, API contract v1, repo/app scaffolding for everyone | 📍 **Sep 14** — setup/planning report, no features expected yet |
| 2 | Sep 15–28 | Auth end-to-end (backend+frontend+mobile) + event creation + CI pipeline | 📍 **Sep 28** — demo: register/login + create an event |
| 3 | Sep 29–Oct 12 | Ticket types & inventory, orders, sandboxed checkout, QR ticket generation | 📍 **Oct 12** — demo: select ticket → simulated checkout → QR ticket issued |
| 4 | Oct 13–26 | Printable PDF tickets, promo codes + Campaign QR, refunds, mobile check-in app, support chat | 📍 **Oct 26** — demo: promo code → checkout → QR ticket → mobile scan/check-in |
| 5 | Oct 27–Nov 9 | Admin analytics dashboard, organizer history/audit trail, full integration pass | 📍 **Nov 9** — demo: admin panel live, whole system connected |
| 6 | Nov 10–16 | Stabilize, fix bugs, polish, docs, rehearse the demo | 📍 **Nov 16 — final delivery** |

## Why the first report looks different

You only have 6 days until Sep 14, so that checkpoint isn't about working
features — it's about proving the foundation is solid: confirmed tech
decisions, a documented API contract, wireframes, and each person's project
scaffolded. Real working features start showing up from the Sep 28 report
onward.

## If you fall behind

Per the SRS, cut in this order before touching the core ticketing flow:
assigned seating → calendar export → advanced (GA4) analytics →
localization polish → refund simulation. The core flow that must always
work: create event → apply promo → select/reserve ticket → checkout →
issue ticket → verify/check in.

## Files

- `PLAN_Nursat.md`
- `PLAN_Aizhan.md`
- `PLAN_Anvar.md`
- `PLAN_Abylai.md`
- `PLAN_Mirat.md`
