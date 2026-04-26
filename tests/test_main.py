import os
import sys
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.main import app

client = TestClient(app)

def test_read_root():
    os.environ["GREETING"] = "TestSalut"
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "TestSalut"}
