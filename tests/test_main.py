import os
import sys
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.models.user import User, UserRole
from app.services.auth_service import get_db, create_access_token

client = TestClient(app)

# Test helper to create auth header
def get_admin_auth_header():
    token = create_access_token(data={"sub": "admin", "role": "ADMIN"})
    return {"Authorization": f"Bearer {token}"}

def test_read_root():
    """Test the root endpoint redirects to login."""
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/auth/login-page"

def test_login_page():
    """Test that login page is accessible."""
    response = client.get("/auth/login-page")
    assert response.status_code == 200
    assert "Login" in response.text

def test_login_invalid_credentials():
    """Test login with invalid credentials."""
    response = client.post(
        "/auth/login",
        data={"username": "invalid", "password": "invalid"}
    )
    assert response.status_code == 401
    assert "Invalid username or password" in response.json()["detail"]

def test_login_valid_credentials():
    """Test login with valid admin credentials."""
    response = client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_get_current_user():
    """Test getting current user info."""
    headers = get_admin_auth_header()
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["username"] == "admin"

def test_dashboard_loads():
    """Test that dashboard page loads (auth checked via JavaScript)."""
    response = client.get("/dashboard")
    assert response.status_code == 200
    assert "Virtual Queue Dashboard" in response.text

def test_register_page():
    """Test that registration page is accessible."""
    response = client.get("/auth/register")
    assert response.status_code == 200
    assert "Create Account" in response.text

def test_register_admin_requires_auth():
    """Test that admin registration requires authentication."""
    response = client.post(
        "/auth/register-admin",
        json={
            "name": "Test",
            "lastname": "User",
            "username": "testuser",
            "email": "test@example.com",
            "role": "STAFF"
        }
    )
    assert response.status_code == 401  # No auth header

