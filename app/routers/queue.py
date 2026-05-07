import hashlib
from datetime import datetime, timezone, date
from typing import List, Literal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.models.user import User, UserRole
from app.models.business import Business
from app.models.queue import Queue
from app.models.queue_session import QueueSession
from app.models.queue_entry import QueueEntry, EntryStatus
from app.services.auth_service import get_db, require_role, get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/api/businesses", tags=["Queues"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class QueueCreate(BaseModel):
    name: str
    max_bar_capacity: int = Field(default=5, ge=1)


class QueueUpdate(BaseModel):
    name: str | None = None
    max_bar_capacity: int | None = Field(default=None, ge=1)


class QueueResponse(BaseModel):
    id: int
    name: str
    max_bar_capacity: int
    current_waiting: int
    is_active: bool
    business_id: int

    class Config:
        from_attributes = True


class WaitingUpdate(BaseModel):
    action: Literal["join", "leave", "call", "serve"]
    # Anonymous device UUID generated in the customer's browser (localStorage).
    # Stored as SHA-256 hash — no personal data, GDPR-safe.
    customer_token: str | None = None   # required for "join"
    entry_id: int | None = None         # required for leave / call / serve


class EntryResponse(BaseModel):
    id: int
    position: int
    status: str
    queue_id: int
    session_id: int
    joined_at: datetime
    called_at: datetime | None
    served_at: datetime | None
    left_at: datetime | None

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_token(raw: str) -> str:
    """SHA-256 hash of the customer token — we never store the raw value."""
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_or_create_session(db: Session, queue_id: int) -> QueueSession:
    """Return today's session for the queue, creating one if this is the first activation."""
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
        db.flush()  # get id without committing
    else:
        # Re-activation within the same day — reopen the session
        session.ended_at = None
    return session


def _next_position(db: Session, session_id: int) -> int:
    """Next sequential position in the day-session (never resets)."""
    max_pos = db.query(func.max(QueueEntry.position)).filter(
        QueueEntry.session_id == session_id
    ).scalar()
    return (max_pos or 0) + 1


def _check_business_access(current_user: User, business_id: int):
    """Helper to check if user can access the business."""
    from fastapi import HTTPException, status

    # Admin users can access any business
    if current_user.role == UserRole.ADMIN:
        return

    # MANAGER/STAFF users can only access their assigned business
    if current_user.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your assigned business"
        )


# ── Queue CRUD ────────────────────────────────────────────────────────────────

@router.get("/{business_id}/queues", response_model=List[QueueResponse])
def list_queues(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List queues for a business (Admin can access any, MANAGER/STAFF only their assigned business)."""
    _check_business_access(current_user, business_id)

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return db.query(Queue).filter(Queue.business_id == business_id).all()


@router.post("/{business_id}/queues", response_model=QueueResponse, status_code=status.HTTP_201_CREATED)
async def create_queue(
    business_id: int,
    queue_data: QueueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a queue for a business (Admin can access any, MANAGER only their assigned business)."""
    _check_business_access(current_user, business_id)

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    queue = Queue(
        name=queue_data.name,
        max_bar_capacity=queue_data.max_bar_capacity,
        current_waiting=0,
        business_id=business_id,
    )
    db.add(queue)
    db.commit()
    db.refresh(queue)

    await manager.broadcast({"type": "business_queues_changed", "business_id": business_id})

    return queue


@router.put("/{business_id}/queues/{queue_id}", response_model=QueueResponse)
async def update_queue(
    business_id: int,
    queue_id: int,
    queue_data: QueueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a queue (Admin can access any, MANAGER only their assigned business)."""
    _check_business_access(current_user, business_id)

    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    if queue_data.name is not None:
        queue.name = queue_data.name
    if queue_data.max_bar_capacity is not None:
        queue.max_bar_capacity = queue_data.max_bar_capacity

    db.commit()
    db.refresh(queue)

    await manager.broadcast({
        "type": "queue_updated",
        "queue_id": queue.id,
        "name": queue.name,
        "max_bar_capacity": queue.max_bar_capacity,
    })

    return queue


# ── Queue status toggle (manages day-sessions) ────────────────────────────────

@router.patch("/{business_id}/queues/{queue_id}/status", response_model=QueueResponse)
async def toggle_queue_status(
    business_id: int,
    queue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Toggle queue status (Admin can access any, MANAGER only their assigned business)."""
    _check_business_access(current_user, business_id)

    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    queue.is_active = not queue.is_active

    if queue.is_active:
        # Activating — open (or reopen) today's session
        _get_or_create_session(db, queue_id)
    else:
        # Deactivating — stamp ended_at on today's session
        today = date.today()
        session = (
            db.query(QueueSession)
            .filter(QueueSession.queue_id == queue_id, QueueSession.date == today)
            .first()
        )
        if session:
            session.ended_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(queue)

    await manager.broadcast({
        "type": "queue_status_update",
        "queue_id": queue.id,
        "is_active": queue.is_active,
    })

    return queue


# ── Customer entry tracking ───────────────────────────────────────────────────

@router.patch("/{business_id}/queues/{queue_id}/waiting", response_model=EntryResponse)
async def update_waiting(
    business_id: int,
    queue_id: int,
    body: WaitingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Track customer lifecycle inside a queue (Admin can access any, MANAGER/STAFF only their assigned business).

    - join:  creates a QueueEntry, returns position + entry_id
    - call:  moves entry to AT_BAR (customer called to the physical counter)
    - serve: marks entry SERVED (order taken / customer done)
    - leave: marks entry LEFT (customer abandoned the queue)

    customer_token is a client-generated UUID (stored in browser localStorage).
    It is hashed server-side before storage — no personal data is kept (GDPR).
    """
    _check_business_access(current_user, business_id)

    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    now = datetime.now(timezone.utc)

    if body.action == "join":
        # Ensure there is an open session today (queue may have been activated earlier)
        session = _get_or_create_session(db, queue_id)
        db.flush()

        position = _next_position(db, session.id)
        hashed_token = _hash_token(body.customer_token) if body.customer_token else None

        entry = QueueEntry(
            session_id=session.id,
            queue_id=queue_id,
            position=position,
            customer_token=hashed_token,
            status=EntryStatus.WAITING,
            joined_at=now,
        )
        db.add(entry)
        queue.current_waiting += 1
        db.commit()
        db.refresh(entry)

    else:
        if not body.entry_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="entry_id required")

        entry = db.query(QueueEntry).filter(QueueEntry.id == body.entry_id, QueueEntry.queue_id == queue_id).first()
        if not entry:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

        if body.action == "call":
            entry.status = EntryStatus.AT_BAR
            entry.called_at = now
        elif body.action == "serve":
            entry.status = EntryStatus.SERVED
            entry.served_at = now
            queue.current_waiting = max(0, queue.current_waiting - 1)
        elif body.action == "leave":
            entry.status = EntryStatus.LEFT
            entry.left_at = now
            queue.current_waiting = max(0, queue.current_waiting - 1)

        db.commit()
        db.refresh(entry)

    await manager.broadcast({
        "type": "queue_count_update",
        "queue_id": queue.id,
        "current_waiting": queue.current_waiting,
    })

    await manager.broadcast({
        "type": "queue_entries_changed",
        "queue_id": queue.id,
    })

    return entry


# ── Active entries (for staff dashboard) ─────────────────────────────────────

@router.get("/{business_id}/queues/{queue_id}/entries", response_model=List[EntryResponse])
def list_queue_entries(
    business_id: int,
    queue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List current WAITING and AT_BAR entries for a queue."""
    _check_business_access(current_user, business_id)

    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    today = date.today()
    session = db.query(QueueSession).filter(
        QueueSession.queue_id == queue_id,
        QueueSession.date == today
    ).first()

    if not session:
        return []

    return db.query(QueueEntry).filter(
        QueueEntry.session_id == session.id,
        QueueEntry.status.in_([EntryStatus.WAITING, EntryStatus.AT_BAR])
    ).order_by(QueueEntry.position).all()


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/{business_id}/queues/{queue_id}/analytics")
def get_queue_analytics(
    business_id: int,
    queue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns per-day session stats for a queue (Admin can access any, MANAGER only their assigned business):
    - total customers joined
    - served / abandoned counts
    - avg wait-to-bar time (minutes)
    - peak hour
    - repeat visitor count (same token seen on multiple days)
    """
    _check_business_access(current_user, business_id)
    
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    sessions = (
        db.query(QueueSession)
        .filter(QueueSession.queue_id == queue_id)
        .order_by(QueueSession.date.desc())
        .limit(90)          # last 90 days
        .all()
    )

    result = []
    for s in sessions:
        entries = db.query(QueueEntry).filter(QueueEntry.session_id == s.id).all()

        total = len(entries)
        served = sum(1 for e in entries if e.status == EntryStatus.SERVED)
        abandoned = sum(1 for e in entries if e.status == EntryStatus.LEFT)

        wait_times = [
            (e.called_at - e.joined_at).total_seconds() / 60
            for e in entries
            if e.called_at and e.joined_at
        ]
        avg_wait = round(sum(wait_times) / len(wait_times), 1) if wait_times else None

        # Peak hour (0-23) by join count
        hour_counts: dict[int, int] = {}
        for e in entries:
            h = e.joined_at.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1
        peak_hour = max(hour_counts, key=hour_counts.get) if hour_counts else None

        # Hours breakdown for charting
        hours_breakdown = [{"hour": h, "count": c} for h, c in sorted(hour_counts.items())]

        result.append({
            "date": s.date.isoformat(),
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "total_joined": total,
            "served": served,
            "abandoned": abandoned,
            "abandonment_rate": round(abandoned / total * 100, 1) if total else 0,
            "avg_wait_minutes": avg_wait,
            "peak_hour": peak_hour,
            "hours_breakdown": hours_breakdown,
        })

    # Cross-day repeat visitors (same token hash on multiple distinct days)
    repeat_count = (
        db.query(QueueEntry.customer_token)
        .join(QueueSession, QueueEntry.session_id == QueueSession.id)
        .filter(QueueSession.queue_id == queue_id, QueueEntry.customer_token.isnot(None))
        .group_by(QueueEntry.customer_token)
        .having(func.count(func.distinct(QueueSession.date)) > 1)
        .count()
    )

    return {
        "queue_id": queue_id,
        "queue_name": queue.name,
        "repeat_visitors_last_90_days": repeat_count,
        "sessions": result,
    }


@router.delete("/{business_id}/queues/{queue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_queue(
    business_id: int,
    queue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.business_id == business_id).first()
    if not queue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")

    db.delete(queue)
    db.commit()

    await manager.broadcast({"type": "business_queues_changed", "business_id": business_id})

    return None
