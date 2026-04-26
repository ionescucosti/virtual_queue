import enum
import secrets
from sqlalchemy import Column, Integer, String, Enum, Boolean
from sqlalchemy.orm import declarative_base
import bcrypt

Base = declarative_base()

class UserRole(enum.Enum):
    ADMIN = "ADMIN"
    OWNER = "OWNER"
    STAFF = "STAFF"

class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    lastname = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=True)  # Nullable until activation
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Boolean, default=False)
    activation_token = Column(String, nullable=True, unique=True)

    @staticmethod
    def hash_password(plain_password: str) -> str:
        return bcrypt.hashpw(plain_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, plain_password: str) -> bool:
        if not self.password:
            return False
        return bcrypt.checkpw(plain_password.encode('utf-8'), self.password.encode('utf-8'))

    @staticmethod
    def generate_activation_token() -> str:
        return secrets.token_urlsafe(32)

