"""Create fresh demo records and exercise the running HTTP API (stdlib only)."""

import argparse
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api")
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
        try:
            with urlopen(request, timeout=15) as response:
                status, body = response.status, response.read()
        except HTTPError as exc:
            status, body = exc.code, exc.read()
        if status != expected:
            raise RuntimeError(f"{path}: expected {expected}, received {status}: {body.decode()}")
        return json.loads(body) if body else None

    suffix = secrets.token_hex(6)
    password = secrets.token_urlsafe(24)

    def account(role):
        email = f"demo-{role}-{suffix}@example.com"
        data = {"email": email, "password": password, "account_type": role}
        if role == "organizer":
            data["organizer_profile"] = {"display_name": "Demo organizer", "contact_email": email}
        call("/auth/register", data, expected=201)
        return call("/auth/login", {"email": email, "password": password})["access"]

    owner, buyer = account("organizer"), account("attendee")
    start = datetime.now(timezone.utc) + timedelta(days=7)
    event = call(
        "/events",
        {
            "title": f"BiletFlow demo {suffix}",
            "description": "End-to-end demo",
            "venue": "Almaty",
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=2)).isoformat(),
            "capacity": 2,
        },
        owner,
        201,
    )
    event_id = event["id"]
    kind = call(
        f"/events/{event_id}/ticket-types",
        {"name": "Standard", "price_minor": 250000, "quantity": 2},
        owner,
        201,
    )
    call(f"/events/{event_id}/publish", {"published": True}, owner)
    order = call(
        "/orders",
        {"event": event_id, "items": [{"ticket_type": kind["id"], "quantity": 1}]},
        buyer,
        201,
    )
    checkout = call(f"/orders/{order['id']}/checkout", {"outcome": "success"}, buyer)
    ticket = checkout["tickets"][0]
    assert checkout["total_minor"] == 250000
    payload = {"qr_token": ticket["qr_token"]}
    assert call("/tickets/verify", payload, owner)["valid"]
    call("/tickets/check-in", payload, owner)
    call("/tickets/check-in", payload, owner, 409)
    assert not call("/tickets/verify", payload, owner)["valid"]
    print(
        json.dumps(
            {
                "result": "ok",
                "event_id": event_id,
                "order_id": order["id"],
                "ticket_id": ticket["id"],
                "total_minor": 250000,
                "check_in": "checked_in",
                "duplicate_check_in": "rejected",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
