from pydantic import BaseModel, ConfigDict
from typing import Optional


class BusinessCreate(BaseModel):
    name: str
    address: str
    phone: str


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None


class BusinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str
    phone: str

