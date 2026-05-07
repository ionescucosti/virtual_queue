#!/usr/bin/env python3
"""Script to update the database schema with new columns."""
import sys
sys.path.insert(0, '.')

from sqlalchemy import text
from app.database import engine

def update_schema():
    """Add new columns to the user table."""

    with engine.connect() as conn:
        # Check if email column exists
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user' AND column_name = 'email'
        """))

        if result.fetchone() is None:
            print("Adding new columns to user table...")

            # Add email column
            conn.execute(text("""
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS email VARCHAR UNIQUE
            """))
            print("  - Added 'email' column")

            # Add is_active column
            conn.execute(text("""
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE
            """))
            print("  - Added 'is_active' column")

            # Add activation_token column
            conn.execute(text("""
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS activation_token VARCHAR UNIQUE
            """))
            print("  - Added 'activation_token' column")

            # Make password nullable
            conn.execute(text("""
                ALTER TABLE "user"
                ALTER COLUMN password DROP NOT NULL
            """))
            print("  - Made 'password' column nullable")

            conn.commit()
            print("\n✅ Schema updated successfully!")
        else:
            print("Schema is already up to date.")

        # Always run these migrations (idempotent)
        print("\nRunning idempotent migrations...")

        # Add business_id FK if missing
        conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES business(id)
        """))
        print("  - Ensured 'business_id' column exists")

        # Add assigned_queue_id FK if missing
        conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS assigned_queue_id INTEGER REFERENCES queue(id)
        """))
        print("  - Ensured 'assigned_queue_id' column exists")

        # Rename role enum value OWNER -> MANAGER
        conn.execute(text("""
            UPDATE "user" SET role = 'MANAGER' WHERE role = 'OWNER'
        """))
        print("  - Migrated role OWNER -> MANAGER")

        conn.commit()
        print("✅ Idempotent migrations done.")

if __name__ == "__main__":
    update_schema()

