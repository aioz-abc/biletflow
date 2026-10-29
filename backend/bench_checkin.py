"""Measure door-scanner latency (verify + check-in) against the running HTTP API.

Creates its own organizer, door staff, attendee and a free event, issues N tickets,
then scans each one the way the mobile app does: POST /tickets/verify followed by
POST /tickets/check-in with the QR token. SRS target: check-in in about 2 seconds.
"""

import argparse
import json
import secrets
import statistics
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

TARGET_SECONDS = 2.0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api")
    parser.add_argument("--tickets", type=int, default=200)
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    def call(path, data=None, token=None, expected=200):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(
            base + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers=headers,
        )
        started = time.perf_counter()
        try:
            with urlopen(request, timeout=15) as response:
                status, body = response.status, response.read()
        except HTTPError as exc:
            status, body = exc.code, exc.read()
        elapsed = time.perf_counter() - started
        if status != expected:
            raise RuntimeError(f"{path}: expected {expected}, received {status}: {body.decode()}")
        return (json.loads(body) if body else None), elapsed

    suffix = secrets.token_hex(6)
    password = secrets.token_urlsafe(24)

    def account(role, label):
        email = f"bench-{label}-{suffix}@example.com"
        data = {"email": email, "password": password, "account_type": role}
        if role == "organizer":
            data["organizer_profile"] = {"display_name": "Bench organizer", "contact_email": email}
        call("/auth/register", data, expected=201)
        return email, call("/auth/login", {"email": email, "password": password})[0]["access"]

    _, owner = account("organizer", "owner")
    staff_email, staff = account("attendee", "door")
    _, buyer = account("attendee", "buyer")

    start = datetime.now(timezone.utc) + timedelta(days=7)
    event = call(
        "/events",
        {
            "title": f"Scanner benchmark {suffix}",
            "venue": "Almaty",
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=2)).isoformat(),
            "capacity": args.tickets,
        },
        owner,
        201,
    )[0]["id"]
    kind = call(
        f"/events/{event}/ticket-types",
        {"name": "Entry", "price_minor": 0, "quantity": args.tickets, "max_per_order": 100},
        owner,
        201,
    )[0]["id"]
    call(f"/events/{event}/publish", {"published": True}, owner)
    call(f"/events/{event}/staff", {"email": staff_email}, owner, 201)

    tokens = []
    remaining = args.tickets
    while remaining:
        quantity = min(remaining, 100)
        order = call(
            "/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": quantity}]},
            buyer,
            201,
        )[0]
        paid = call(f"/orders/{order['id']}/checkout", {"outcome": "success"}, buyer)[0]
        tokens += [ticket["qr_token"] for ticket in paid["tickets"]]
        remaining -= quantity

    verify, check_in = [], []
    for token in tokens:
        body, elapsed = call("/tickets/verify", {"qr_token": token}, staff)
        assert body["valid"], body
        verify.append(elapsed)
        body, elapsed = call("/tickets/check-in", {"qr_token": token}, staff)
        assert body["status"] == "checked_in", body
        check_in.append(elapsed)
    _, duplicate = call("/tickets/check-in", {"qr_token": tokens[0]}, staff, 409)

    def summary(samples):
        ordered = sorted(samples)
        p95 = ordered[max(0, round(len(ordered) * 0.95) - 1)]
        return {
            "p50_ms": round(statistics.median(ordered) * 1000, 1),
            "p95_ms": round(p95 * 1000, 1),
            "max_ms": round(ordered[-1] * 1000, 1),
        }

    full_scan = [v + c for v, c in zip(verify, check_in, strict=True)]
    report = {
        "tickets": len(tokens),
        "verify": summary(verify),
        "check_in": summary(check_in),
        "verify_plus_check_in": summary(full_scan),
        "duplicate_rejected_ms": round(duplicate * 1000, 1),
        "target_ms": TARGET_SECONDS * 1000,
        "within_target": max(full_scan) < TARGET_SECONDS,
    }
    print(json.dumps(report, indent=2))
    if not report["within_target"]:
        raise SystemExit("Scanner latency exceeded the SRS target.")


if __name__ == "__main__":
    main()
