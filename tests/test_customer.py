"""
Tests for the public customer-facing endpoints (the QR code flow).

Covers:
  GET  /api/public/businesses/by-slug/{slug}
  GET  /api/public/businesses/{id}
  GET  /api/public/config
  POST /api/public/businesses/{id}/queues/{id}/join
  GET  /api/public/businesses/{id}/queues/{id}/position
  POST /api/public/businesses/{id}/queues/{id}/leave
"""

import hashlib
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.business import Business
from app.models.queue import Queue
from app.models.queue_session import QueueSession
from app.models.queue_entry import QueueEntry
from app.database import SessionLocal

client = TestClient(app)

# Stable unique device token used across tests (different from any real user data)
DEVICE_TOKEN = "pytest-device-token-customer-screen-abc123"
OTHER_DEVICE_TOKEN = "pytest-device-token-other-customer-xyz789"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── Fixture ───────────────────────────────────────────────────────────────────

SLUG = "qr-test-cafe-pytest-unique"


def _purge_test_data(db) -> None:
    """Delete all rows created by this test module. Safe to call at any time."""
    old = db.query(Business).filter(Business.slug == SLUG).first()
    if old:
        old_qids = [q.id for q in db.query(Queue).filter(Queue.business_id == old.id).all()]
        if old_qids:
            db.query(QueueEntry).filter(QueueEntry.queue_id.in_(old_qids)).delete(synchronize_session=False)
            db.query(QueueSession).filter(QueueSession.queue_id.in_(old_qids)).delete(synchronize_session=False)
        db.query(Queue).filter(Queue.business_id == old.id).delete(synchronize_session=False)
        db.delete(old)
        db.commit()


@pytest.fixture
def test_data():
    """
    Provision one business with an active queue and an inactive queue.
    Tears down all created rows after each test.
    """
    db = SessionLocal()
    _purge_test_data(db)  # guard against leftovers from a previous failed run
    biz = Business(
        name="QR Test Cafe",
        address="1 Queue Street",
        phone="555-0001",
        slug=SLUG,
    )
    db.add(biz)
    db.flush()

    q_active = Queue(
        name="Main Queue",
        max_bar_capacity=10,
        current_waiting=0,
        is_active=True,
        business_id=biz.id,
    )
    q_inactive = Queue(
        name="VIP Queue (closed)",
        max_bar_capacity=5,
        current_waiting=0,
        is_active=False,
        business_id=biz.id,
    )
    db.add_all([q_active, q_inactive])
    db.commit()

    data = {
        "biz_id": biz.id,
        "active_qid": q_active.id,
        "inactive_qid": q_inactive.id,
        "slug": biz.slug,
    }
    db.close()

    yield data

    # Teardown — must delete in FK dependency order.
    # QueueEntry.queue_id → queue.id has NO ondelete=CASCADE, so entries
    # must be deleted explicitly before queues can be removed.
    db2 = SessionLocal()
    queue_ids = [data["active_qid"], data["inactive_qid"]]
    db2.query(QueueEntry).filter(
        QueueEntry.queue_id.in_(queue_ids)
    ).delete(synchronize_session=False)
    db2.query(QueueSession).filter(
        QueueSession.queue_id.in_(queue_ids)
    ).delete(synchronize_session=False)
    db2.query(Queue).filter(
        Queue.business_id == data["biz_id"]
    ).delete(synchronize_session=False)
    db2.query(Business).filter(
        Business.id == data["biz_id"]
    ).delete(synchronize_session=False)
    db2.commit()
    db2.close()


# ── Business lookup ───────────────────────────────────────────────────────────

class TestGetBusinessBySlug:
    def test_returns_200_for_valid_slug(self, test_data):
        r = client.get(f"/api/public/businesses/by-slug/{test_data['slug']}")
        assert r.status_code == 200

    def test_returns_business_name_and_address(self, test_data):
        r = client.get(f"/api/public/businesses/by-slug/{test_data['slug']}")
        body = r.json()
        assert body["name"] == "QR Test Cafe"
        assert body["address"] == "1 Queue Street"
        assert body["slug"] == test_data["slug"]

    def test_returns_all_queues_including_inactive(self, test_data):
        r = client.get(f"/api/public/businesses/by-slug/{test_data['slug']}")
        queues = r.json()["queues"]
        assert len(queues) == 2
        statuses = {q["is_active"] for q in queues}
        assert True in statuses   # active queue present
        assert False in statuses  # inactive queue present

    def test_returns_404_for_unknown_slug(self, test_data):
        r = client.get("/api/public/businesses/by-slug/slug-that-does-not-exist")
        assert r.status_code == 404

    def test_lookup_by_numeric_id_also_works(self, test_data):
        r = client.get(f"/api/public/businesses/by-slug/{test_data['biz_id']}")
        assert r.status_code == 200
        assert r.json()["id"] == test_data["biz_id"]


class TestGetBusinessById:
    def test_returns_200_for_valid_id(self, test_data):
        r = client.get(f"/api/public/businesses/{test_data['biz_id']}")
        assert r.status_code == 200

    def test_returns_404_for_missing_id(self, test_data):
        r = client.get("/api/public/businesses/999999999")
        assert r.status_code == 404


# ── Public config ─────────────────────────────────────────────────────────────

class TestPublicConfig:
    def test_config_endpoint_returns_200(self):
        r = client.get("/api/public/config")
        assert r.status_code == 200

    def test_config_returns_public_url_field(self):
        r = client.get("/api/public/config")
        body = r.json()
        assert "public_url" in body

    def test_config_public_url_is_a_string_or_null(self):
        r = client.get("/api/public/config")
        url = r.json()["public_url"]
        assert url is None or isinstance(url, str)

    def test_config_url_starts_with_http_when_present(self):
        r = client.get("/api/public/config")
        url = r.json()["public_url"]
        if url is not None:
            assert url.startswith("http"), f"Expected http(s) URL, got: {url}"


# ── Join queue ────────────────────────────────────────────────────────────────

class TestJoinQueue:
    def test_join_active_queue_returns_200(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 200

    def test_join_returns_entry_id_and_position(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        body = r.json()
        assert "entry_id" in body
        assert "position" in body
        assert body["entry_id"] > 0

    def test_first_customer_gets_position_1(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r.json()["position"] == 1

    def test_second_customer_gets_position_2(self, test_data):
        client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        r2 = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": OTHER_DEVICE_TOKEN},
        )
        assert r2.json()["position"] == 2

    def test_join_increments_current_waiting(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r.json()["current_waiting"] == 1

    def test_join_inactive_queue_returns_400(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['inactive_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 400

    def test_join_nonexistent_queue_returns_404(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/999999999/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 404

    def test_join_wrong_business_id_returns_404(self, test_data):
        # queue_id belongs to biz_id, but we pass a different business_id
        r = client.post(
            f"/api/public/businesses/999999999/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 404

    def test_duplicate_join_same_business_returns_409(self, test_data):
        client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        r2 = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r2.status_code == 409

    def test_can_rejoin_after_leaving(self, test_data):
        # First join
        r1 = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        entry_id = r1.json()["entry_id"]

        # Leave
        client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": entry_id, "customer_token": DEVICE_TOKEN},
        )

        # Rejoin — must not be 409
        r3 = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert r3.status_code == 200


# ── Position ──────────────────────────────────────────────────────────────────

class TestGetPosition:
    def _join(self, test_data, token=DEVICE_TOKEN):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": token},
        )
        return r.json()

    def test_get_position_returns_200(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 200

    def test_position_response_has_required_fields(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        body = r.json()
        for field in ("entry_id", "position", "status", "current_waiting", "place_in_line", "queue_name", "queue_is_active"):
            assert field in body, f"Missing field: {field}"

    def test_first_customer_is_place_1_in_line(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.json()["place_in_line"] == 1

    def test_second_customer_is_place_2_in_line(self, test_data):
        self._join(test_data, token=DEVICE_TOKEN)
        joined2 = self._join(test_data, token=OTHER_DEVICE_TOKEN)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined2["entry_id"], "customer_token": OTHER_DEVICE_TOKEN},
        )
        assert r.json()["place_in_line"] == 2

    def test_status_is_waiting_after_join(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.json()["status"] == "WAITING"

    def test_wrong_token_returns_404(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": "wrong-token-entirely"},
        )
        assert r.status_code == 404

    def test_nonexistent_entry_id_returns_404(self, test_data):
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": 999999999, "customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 404

    def test_queue_name_matches(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.json()["queue_name"] == "Main Queue"

    def test_queue_is_active_is_true(self, test_data):
        joined = self._join(test_data)
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.json()["queue_is_active"] is True


# ── Leave queue ───────────────────────────────────────────────────────────────

class TestLeaveQueue:
    def _join(self, test_data, token=DEVICE_TOKEN):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/join",
            json={"customer_token": token},
        )
        return r.json()

    def test_leave_returns_200(self, test_data):
        joined = self._join(test_data)
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 200

    def test_leave_returns_status_left(self, test_data):
        joined = self._join(test_data)
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.json()["status"] == "left"

    def test_leave_decrements_current_waiting(self, test_data):
        joined = self._join(test_data)
        # Verify waiting is 1
        pos_before = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        ).json()
        assert pos_before["current_waiting"] == 1

        # Leave
        client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )

        # Verify waiting is 0 via business info
        biz = client.get(f"/api/public/businesses/{test_data['biz_id']}").json()
        active_q = next(q for q in biz["queues"] if q["id"] == test_data["active_qid"])
        assert active_q["current_waiting"] == 0

    def test_leave_with_wrong_token_returns_404(self, test_data):
        joined = self._join(test_data)
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": "completely-wrong-token"},
        )
        assert r.status_code == 404

    def test_leave_nonexistent_entry_returns_404(self, test_data):
        r = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": 999999999, "customer_token": DEVICE_TOKEN},
        )
        assert r.status_code == 404

    def test_leave_twice_returns_400(self, test_data):
        joined = self._join(test_data)
        client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        r2 = client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r2.status_code == 400

    def test_position_status_is_left_after_leaving(self, test_data):
        joined = self._join(test_data)
        client.post(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/leave",
            json={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        r = client.get(
            f"/api/public/businesses/{test_data['biz_id']}/queues/{test_data['active_qid']}/position",
            params={"entry_id": joined["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert r.json()["status"] == "LEFT"


# ── Full customer journey ─────────────────────────────────────────────────────

class TestFullCustomerJourney:
    def test_scan_qr_see_queues_join_check_position_leave(self, test_data):
        """Simulates a customer scanning the QR code end-to-end."""

        # 1. Customer lands on /<slug> → frontend calls this to show business info
        r = client.get(f"/api/public/businesses/by-slug/{test_data['slug']}")
        assert r.status_code == 200
        biz = r.json()
        assert len(biz["queues"]) == 2

        # 2. Customer sees the active queue and joins
        active_queues = [q for q in biz["queues"] if q["is_active"]]
        assert len(active_queues) == 1, "There should be exactly one active queue"
        queue = active_queues[0]

        join_r = client.post(
            f"/api/public/businesses/{biz['id']}/queues/{queue['id']}/join",
            json={"customer_token": DEVICE_TOKEN},
        )
        assert join_r.status_code == 200
        join_data = join_r.json()
        assert join_data["position"] == 1
        assert join_data["current_waiting"] == 1

        # 3. Customer polls their position
        pos_r = client.get(
            f"/api/public/businesses/{biz['id']}/queues/{queue['id']}/position",
            params={"entry_id": join_data["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert pos_r.status_code == 200
        pos = pos_r.json()
        assert pos["status"] == "WAITING"
        assert pos["place_in_line"] == 1
        assert pos["queue_name"] == "Main Queue"
        assert pos["queue_is_active"] is True

        # 4. Customer decides to leave
        leave_r = client.post(
            f"/api/public/businesses/{biz['id']}/queues/{queue['id']}/leave",
            json={"entry_id": join_data["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert leave_r.status_code == 200
        assert leave_r.json()["status"] == "left"

        # 5. Status is now LEFT
        pos_after = client.get(
            f"/api/public/businesses/{biz['id']}/queues/{queue['id']}/position",
            params={"entry_id": join_data["entry_id"], "customer_token": DEVICE_TOKEN},
        )
        assert pos_after.json()["status"] == "LEFT"
