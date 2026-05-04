from sqlalchemy import Column, Integer, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.models.user import Base


class QueueSession(Base):
    __tablename__ = "queue_session"

    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("queue.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)       # calendar day (UTC)
    started_at = Column(DateTime(timezone=True), nullable=False)   # first activation
    ended_at = Column(DateTime(timezone=True), nullable=True)      # last deactivation; null = still open

    queue = relationship("Queue", back_populates="sessions")
    entries = relationship("QueueEntry", back_populates="session", cascade="all, delete-orphan")
