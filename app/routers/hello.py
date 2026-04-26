from fastapi import APIRouter
import os

router = APIRouter()

@router.get("/")
def read_root():
    greeting = os.environ.get("GREETING", "Hello")
    return {"message": greeting}

