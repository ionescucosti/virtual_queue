#!/usr/bin/env python3
"""
Regenerate slugs for all businesses based on their current names.
Run this script to fix any businesses with missing or incorrect slugs.

Usage:
    python scripts/regenerate_slugs.py
"""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.business import Business
from app.utils import unique_slug


def main():
    db = SessionLocal()
    try:
        businesses = db.query(Business).all()
        print(f"Found {len(businesses)} businesses\n")

        updated = 0
        for biz in businesses:
            expected_slug = unique_slug(db, biz.name, exclude_id=biz.id)
            print(f"Business #{biz.id}: '{biz.name}'")
            print(f"  Current slug: {biz.slug}")
            print(f"  Expected slug: {expected_slug}")

            if biz.slug != expected_slug:
                biz.slug = expected_slug
                updated += 1
                print(f"  → Updated!")
            print()

        if updated > 0:
            db.commit()
            print(f"\n✅ Updated {updated} business slug(s)")
        else:
            print("\n✅ All slugs are already correct")

    finally:
        db.close()


if __name__ == "__main__":
    main()

