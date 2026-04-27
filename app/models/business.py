from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.models.user import Base


class Business(Base):
    __tablename__ = "business"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    phone = Column(String, nullable=False)

    # Relationships
    users = relationship("User", back_populates="business")
    queues = relationship("Queue", back_populates="business", cascade="all, delete-orphan")

