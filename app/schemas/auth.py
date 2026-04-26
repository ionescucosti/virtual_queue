from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from app.models.user import UserRole

class UserRegisterRequest(BaseModel):
    name: str
    lastname: str
    username: str
    email: EmailStr
    role: UserRole

class UserActivateRequest(BaseModel):
    token: str
    password: str

class UserLoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    lastname: str
    username: str
    email: str
    role: UserRole
    is_active: bool


