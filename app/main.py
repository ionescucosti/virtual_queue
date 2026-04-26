import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.routers import auth, dashboard
from app.websocket.handlers import router as ws_router
from app.websocket.redis_pubsub import redis_pubsub
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting application with log level: %s", log_level)
    Base.metadata.create_all(bind=engine)
    await redis_pubsub.connect()
    await redis_pubsub.start_listener()
    yield
    # Shutdown
    await redis_pubsub.disconnect()
    logger.info("Application shutdown complete")

app = FastAPI(
    title="Virtual Queue API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        os.getenv("FRONTEND_URL", "http://localhost:3000")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    """Redirect to login page."""
    return RedirectResponse(url="/auth/login-page")

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}

# Include routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(ws_router)

