from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.models.user import Base


class Queue(Base):
    __tablename__ = "queue"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    max_bar_capacity = Column(Integer, nullable=False, default=5)
    current_waiting = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    pinned_message = Column(String, nullable=True)
    business_id = Column(Integer, ForeignKey("business.id"), nullable=False)

    business = relationship("Business", back_populates="queues")
    sessions = relationship("QueueSession", back_populates="queue", cascade="all, delete-orphan")
