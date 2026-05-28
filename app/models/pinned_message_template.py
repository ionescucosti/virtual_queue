from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.models.user import Base


class PinnedMessageTemplate(Base):
    __tablename__ = "pinned_message_template"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=False)
    business_id = Column(Integer, ForeignKey("business.id"), nullable=False)

    business = relationship("Business", back_populates="pinned_message_templates")
