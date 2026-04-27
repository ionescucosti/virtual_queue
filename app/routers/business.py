from typing import List
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.models.user import User, UserRole
from app.models.business import Business
from app.schemas.business import BusinessCreate, BusinessUpdate, BusinessResponse
from app.services.auth_service import get_db, require_role
from app.services.email_service import send_activation_email

logger = logging.getLogger("virtual_queue")

router = APIRouter(prefix="/api/businesses", tags=["Businesses"])


# Schema for creating a user in a business
class BusinessUserCreate(BaseModel):
    name: str
    lastname: str
    username: str
    email: EmailStr
    role: str  # MANAGER or STAFF only


class BusinessUserUpdate(BaseModel):
    name: str | None = None
    lastname: str | None = None
    username: str | None = None
    email: EmailStr | None = None
    role: str | None = None


class BusinessUserResponse(BaseModel):
    id: int
    name: str
    lastname: str
    username: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=List[BusinessResponse])
def list_businesses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """List all businesses (Admin only)."""
    businesses = db.query(Business).all()
    return businesses


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
def create_business(
    business_data: BusinessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Create a new business (Admin only)."""
    business = Business(
        name=business_data.name,
        address=business_data.address,
        phone=business_data.phone
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


@router.get("/{business_id}", response_model=BusinessResponse)
def get_business(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Get a specific business by ID (Admin only)."""
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    return business


@router.put("/{business_id}", response_model=BusinessResponse)
def update_business(
    business_id: int,
    business_data: BusinessUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Update a business (Admin only)."""
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )

    if business_data.name is not None:
        business.name = business_data.name
    if business_data.address is not None:
        business.address = business_data.address
    if business_data.phone is not None:
        business.phone = business_data.phone

    db.commit()
    db.refresh(business)
    return business


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Delete a business (Admin only)."""
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )

    db.delete(business)
    db.commit()
    return None


# User management for a business

@router.get("/{business_id}/users", response_model=List[BusinessUserResponse])
def list_business_users(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """List all users assigned to a business (Admin only)."""
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )

    users = db.query(User).filter(User.business_id == business_id).all()
    return [
        BusinessUserResponse(
            id=u.id,
            name=u.name,
            lastname=u.lastname,
            username=u.username,
            email=u.email,
            role=u.role.value,
            is_active=u.is_active
        )
        for u in users
    ]


@router.post("/{business_id}/users", response_model=BusinessUserResponse, status_code=status.HTTP_201_CREATED)
def create_business_user(
    business_id: int,
    user_data: BusinessUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Create a new user for a business (Admin only). Sends activation email."""
    # Validate business exists
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )

    # Validate role (only MANAGER or STAFF allowed)
    if user_data.role not in ["MANAGER", "STAFF"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be MANAGER or STAFF"
        )

    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email already exists
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user with activation token
    activation_token = User.generate_activation_token()
    role = UserRole.MANAGER if user_data.role == "MANAGER" else UserRole.STAFF

    new_user = User(
        name=user_data.name,
        lastname=user_data.lastname,
        username=user_data.username,
        email=user_data.email,
        role=role,
        is_active=False,
        activation_token=activation_token,
        password=None,
        business_id=business_id
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send activation email
    try:
        send_activation_email(user_data.email, activation_token, user_data.name)
        logger.info(f"Activation email sent to {user_data.email} for business {business.name}")
    except Exception as e:
        logger.error(f"Failed to send activation email: {e}")
        # Don't fail the request, user can request new activation email later

    return BusinessUserResponse(
        id=new_user.id,
        name=new_user.name,
        lastname=new_user.lastname,
        username=new_user.username,
        email=new_user.email,
        role=new_user.role.value,
        is_active=new_user.is_active
    )


@router.put("/{business_id}/users/{user_id}", response_model=BusinessUserResponse)
def update_business_user(
    business_id: int,
    user_id: int,
    user_data: BusinessUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Update a user belonging to a business (Admin only)."""
    user = db.query(User).filter(User.id == user_id, User.business_id == business_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_data.name is not None:
        user.name = user_data.name
    if user_data.lastname is not None:
        user.lastname = user_data.lastname
    if user_data.username is not None:
        existing = db.query(User).filter(User.username == user_data.username, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        user.username = user_data.username
    if user_data.email is not None:
        existing = db.query(User).filter(User.email == user_data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already taken")
        user.email = user_data.email
    if user_data.role is not None:
        if user_data.role not in ["MANAGER", "STAFF"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be MANAGER or STAFF")
        user.role = UserRole.MANAGER if user_data.role == "MANAGER" else UserRole.STAFF

    db.commit()
    db.refresh(user)
    return BusinessUserResponse(
        id=user.id, name=user.name, lastname=user.lastname,
        username=user.username, email=user.email,
        role=user.role.value, is_active=user.is_active
    )


@router.delete("/{business_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business_user(
    business_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Delete a user from a business (Admin only)."""
    user = db.query(User).filter(User.id == user_id, User.business_id == business_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.delete(user)
    db.commit()
    return None
