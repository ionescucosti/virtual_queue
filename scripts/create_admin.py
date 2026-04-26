#!/usr/bin/env python3
"""Script to create the initial ADMIN user."""
import sys
sys.path.insert(0, '.')

from app.database import SessionLocal
from app.models.user import User, UserRole

def create_admin():
    db = SessionLocal()

    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if existing_admin:
            print(f"Admin user already exists: {existing_admin.username}")
            return

        # Create admin user
        admin = User(
            name="Admin",
            lastname="User",
            username="admin",
            email="admin@virtualqueue.com",
            password=User.hash_password("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
            activation_token=None
        )

        db.add(admin)
        db.commit()
        print("=" * 50)
        print("Admin user created successfully!")
        print("=" * 50)
        print("Username: admin")
        print("Password: admin123")
        print("=" * 50)
        print("⚠️  Please change the password after first login!")
        print("=" * 50)
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()

