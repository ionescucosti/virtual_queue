import re
import uuid
from sqlalchemy.orm import Session


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-') or 'business'


def unique_slug(db: Session, name: str, exclude_id: int | None = None) -> str:
    from app.models.business import Business
    base = slugify(name)
    while True:
        slug = f"{base}-{uuid.uuid4().hex[:8]}"
        q = db.query(Business).filter(Business.slug == slug)
        if exclude_id is not None:
            q = q.filter(Business.id != exclude_id)
        if not q.first():
            return slug
