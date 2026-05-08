import hashlib
import json
import os
import urllib.request
import urllib.error
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from app.models.business import Business
from app.models.queue import Queue
from app.models.queue_session import QueueSession
from app.models.queue_entry import QueueEntry, EntryStatus
from app.services.auth_service import get_db
from app.websocket.manager import manager

router = APIRouter(prefix="/api/public", tags=["Customer"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class QueuePublicInfo(BaseModel):
    id: int
    name: str
    max_bar_capacity: int
    current_waiting: int
    is_active: bool

    class Config:
        from_attributes = True


class BusinessPublicInfo(BaseModel):
    id: int
    name: str
    address: str
    phone: str
    slug: str | None = None
    queues: List[QueuePublicInfo]


class JoinRequest(BaseModel):
    customer_token: str  # raw UUID from browser localStorage; stored as SHA-256 hash


class LeaveRequest(BaseModel):
    entry_id: int
    customer_token: str


class JoinResponse(BaseModel):
    entry_id: int
    position: int
    queue_id: int
    business_id: int
    current_waiting: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_or_create_session(db: Session, queue_id: int) -> QueueSession:
    today = date.today()
    session = (
        db.query(QueueSession)
        .filter(QueueSession.queue_id == queue_id, QueueSession.date == today)
        .first()
    )
    if not session:
        session = QueueSession(
            queue_id=queue_id,
            date=today,
            started_at=datetime.now(timezone.utc),
            ended_at=None,
        )
        db.add(session)
        db.flush()
    return session


def _next_position(db: Session, session_id: int) -> int:
    max_pos = db.query(func.max(QueueEntry.position)).filter(
        QueueEntry.session_id == session_id
    ).scalar()
    return (max_pos or 0) + 1


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/businesses/{business_id}", response_model=BusinessPublicInfo)
def get_business_public(business_id: int, db: Session = Depends(get_db)):
    """Public: business name + all queues (for QR code landing page)."""
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    queues = db.query(Queue).filter(Queue.business_id == business_id).all()
    return BusinessPublicInfo(
        id=business.id,
        name=business.name,
        address=business.address,
        phone=business.phone,
        slug=business.slug,
        queues=[
            QueuePublicInfo(
                id=q.id,
                name=q.name,
                max_bar_capacity=q.max_bar_capacity,
                current_waiting=q.current_waiting,
                is_active=q.is_active,
            )
            for q in queues
        ],
    )


@router.get("/businesses/by-slug/{slug}", response_model=BusinessPublicInfo)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)):
    """Public: get business by slug or ID (for customer-friendly URLs)."""
    # First try slug lookup
    business = db.query(Business).filter(Business.slug == slug).first()
    # Fallback: try numeric ID if slug not found
    if not business and slug.isdigit():
        business = db.query(Business).filter(Business.id == int(slug)).first()
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    queues = db.query(Queue).filter(Queue.business_id == business.id).all()
    return BusinessPublicInfo(
        id=business.id,
        name=business.name,
        address=business.address,
        phone=business.phone,
        slug=business.slug,
        queues=[
            QueuePublicInfo(
                id=q.id,
                name=q.name,
                max_bar_capacity=q.max_bar_capacity,
                current_waiting=q.current_waiting,
                is_active=q.is_active,
            )
            for q in queues
        ],
    )


@router.post("/businesses/{business_id}/queues/{queue_id}/join", response_model=JoinResponse)
async def join_queue(
    business_id: int,
    queue_id: int,
    body: JoinRequest,
    db: Session = Depends(get_db),
):
    """Public: anonymous customer joins a queue. Enforces one-active-entry-per-business rule."""
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")
    if not queue.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This queue is not active")

    hashed = _hash(body.customer_token)
    today = date.today()

    # Enforce: one active entry per business per day
    conflict = (
        db.query(QueueEntry)
        .join(QueueSession, QueueEntry.session_id == QueueSession.id)
        .join(Queue, QueueEntry.queue_id == Queue.id)
        .filter(
            Queue.business_id == business_id,
            QueueSession.date == today,
            QueueEntry.customer_token == hashed,
            QueueEntry.status.in_([EntryStatus.WAITING, EntryStatus.AT_BAR]),
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already in a queue for this business",
        )

    session = _get_or_create_session(db, queue_id)
    db.flush()
    position = _next_position(db, session.id)

    entry = QueueEntry(
        session_id=session.id,
        queue_id=queue_id,
        position=position,
        customer_token=hashed,
        status=EntryStatus.WAITING,
        joined_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    queue.current_waiting += 1
    db.commit()
    db.refresh(entry)

    await manager.broadcast({"type": "queue_count_update", "queue_id": queue.id, "current_waiting": queue.current_waiting})
    await manager.broadcast({"type": "queue_entries_changed", "queue_id": queue.id})

    return JoinResponse(
        entry_id=entry.id,
        position=entry.position,
        queue_id=queue.id,
        business_id=business_id,
        current_waiting=queue.current_waiting,
    )


@router.post("/businesses/{business_id}/queues/{queue_id}/leave")
async def leave_queue(
    business_id: int,
    queue_id: int,
    body: LeaveRequest,
    db: Session = Depends(get_db),
):
    """Public: anonymous customer leaves a queue."""
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    hashed = _hash(body.customer_token)
    entry = db.query(QueueEntry).filter(
        QueueEntry.id == body.entry_id,
        QueueEntry.queue_id == queue_id,
        QueueEntry.customer_token == hashed,
    ).first()

    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    if entry.status not in [EntryStatus.WAITING, EntryStatus.AT_BAR]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already served or left")

    entry.status = EntryStatus.LEFT
    entry.left_at = datetime.now(timezone.utc)
    queue.current_waiting = max(0, queue.current_waiting - 1)
    db.commit()

    await manager.broadcast({"type": "queue_count_update", "queue_id": queue.id, "current_waiting": queue.current_waiting})
    await manager.broadcast({"type": "queue_entries_changed", "queue_id": queue.id})

    return {"status": "left"}


@router.get("/businesses/{business_id}/queues/{queue_id}/position")
def get_my_position(
    business_id: int,
    queue_id: int,
    entry_id: int = Query(...),
    customer_token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Public: get current position + status for an anonymous customer entry."""
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    hashed = _hash(customer_token)
    entry = db.query(QueueEntry).filter(
        QueueEntry.id == entry_id,
        QueueEntry.queue_id == queue_id,
        QueueEntry.customer_token == hashed,
    ).first()

    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    ahead = (
        db.query(QueueEntry)
        .filter(
            QueueEntry.session_id == entry.session_id,
            QueueEntry.status == EntryStatus.WAITING,
            QueueEntry.position < entry.position,
        )
        .count()
    )
    place_in_line = (ahead + 1) if entry.status == EntryStatus.WAITING else 0

    return {
        "entry_id": entry.id,
        "position": entry.position,
        "status": entry.status.value,
        "current_waiting": queue.current_waiting,
        "place_in_line": place_in_line,
        "queue_name": queue.name,
        "queue_is_active": queue.is_active,
        "pinned_message": queue.pinned_message,
    }


@router.get("/config")
def get_public_config():
    """
    Returns the public-facing base URL for customer QR codes.

    Priority:
      1. PUBLIC_URL env var (set manually for stable URLs — local IP, ngrok, cloud, etc.)
      2. cloudflared quick-tunnel URL (auto-discovered when running with --profile tunnel)
      3. null  (frontend falls back to window.location.origin)
    """
    # 1. Manual PUBLIC_URL env var takes priority
    public_url = os.getenv("PUBLIC_URL", "").strip()
    if public_url:
        return {"public_url": public_url.rstrip("/"), "source": "env"}

    # 2. Try cloudflared quick-tunnel metrics API (only works inside Docker network)
    try:
        with urllib.request.urlopen("http://cloudflared:8080/quicktunnel", timeout=1) as resp:
            data = json.loads(resp.read())
            url = data.get("url") or data.get("hostname")
            if url:
                if not url.startswith("http"):
                    url = f"https://{url}"
                return {"public_url": url, "source": "cloudflared"}
    except Exception:
        pass


    return {"public_url": None, "source": "none"}
