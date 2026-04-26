import logging
import os
from fastapi import FastAPI
from dotenv import load_dotenv
from app.routers import hello
from app.database import engine
from app.models.user import Base

# Load environment variables from .env file
load_dotenv()

# Configure logging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=log_level,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("virtual_queue")
logger.info("Starting application with log level: %s", log_level)

# Create tables if not exist
Base.metadata.create_all(bind=engine)

app = FastAPI()
app.include_router(hello.router)

