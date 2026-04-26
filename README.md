# Virtual Queue

A scalable virtual queue management system with real-time notifications, built with FastAPI, React, WebSocket, and Redis.

## Features

- 🔐 **JWT Authentication** - Secure login with role-based access (ADMIN, OWNER, STAFF)
- 📧 **Email Activation** - User registration with email verification via Resend
- 📱 **Mobile-First PWA** - Responsive design optimized for mobile devices
- 🔔 **Real-time Notifications** - Instant announcements via WebSocket
- 📊 **Role-based Dashboards** - Different views for Admin, Owner, and Staff
- 🚀 **Scalable Architecture** - Redis Pub/Sub for scaling to 1000+ concurrent users per queue
- 🔒 **HTTPS Ready** - Let's Encrypt SSL certificate support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NGINX (Port 443/80)                      │
│              - HTTPS (Let's Encrypt)                        │
│              - WebSocket proxy                              │
│              - Load balancing                               │
├─────────────────────────────────────────────────────────────┤
│    /api/*   →  FastAPI                                      │
│    /ws/*    →  WebSocket                                    │
│    /*       →  React PWA                                    │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐           ┌─────────────────┐
│   FastAPI API   │           │   React PWA     │
│  + WebSocket    │           │ + Notifications │
└────────┬────────┘           └─────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌───────┐
│ Redis │  │Postgres│
│Pub/Sub│  │  DB   │
└───────┘  └───────┘
```

## Quick Start

### Development (Local)

1. **Start database and Redis**
   ```bash
   docker compose up db redis -d
   ```

2. **Install backend dependencies**
   ```bash
   uv venv
   source .venv/bin/activate
   uv pip install -r pyproject.toml
   ```

3. **Create admin user** (first time only)
   ```bash
   python scripts/create_admin.py
   ```

4. **Run backend**
   ```bash
   uvicorn app.main:app --reload
   ```

5. **Install frontend dependencies** (in new terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. **Access the app**
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/docs
   - Default login: `admin` / `admin123`

### Development (Docker)

```bash
# Start all services
docker compose up --build

# Access at http://localhost:8000
```

### Production with HTTPS

1. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Get SSL certificate**
   ```bash
   # First, update nginx.conf with your domain
   # Then run certbot
   docker compose -f docker-compose.prod.yml run --rm certbot certonly \
     --webroot --webroot-path=/var/www/certbot \
     -d yourdomain.com
   ```

3. **Start production stack**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/auth/register` | Registration form | ❌ |
| POST | `/auth/register` | Public registration | ❌ |
| POST | `/auth/register-admin` | Admin creates user | ✅ ADMIN |
| GET | `/auth/activate?token=xxx` | Activation form | ❌ |
| POST | `/auth/activate` | Set password | ❌ |
| GET | `/auth/login-page` | Login form | ❌ |
| POST | `/auth/login` | Get JWT token | ❌ |
| GET | `/auth/me` | Current user info | ✅ |

### WebSocket

| Endpoint | Description | Auth |
|----------|-------------|------|
| `/ws/notify?token=JWT&queue_id=ID` | Customer notifications | Optional |
| `/ws/staff?token=JWT` | Staff announcements | ✅ STAFF+ |

### WebSocket Messages

**Receive (Customer):**
```json
{"type": "announcement", "message": "Come to counter 3"}
{"type": "your_turn", "message": "It's your turn!", "sound": true}
{"type": "position_update", "position": 5}
```

**Send (Staff):**
```json
{"type": "announce", "queue_id": "q1", "message": "Bar closing soon"}
{"type": "call_customer", "customer_id": 123, "message": "Counter 3"}
```

## Project Structure

```
virtual_queue/
├── app/                          # FastAPI Backend
│   ├── main.py                   # Application entry
│   ├── database.py               # SQLAlchemy setup
│   ├── models/                   # Database models
│   ├── schemas/                  # Pydantic schemas
│   ├── services/                 # Business logic
│   ├── routers/                  # API routes
│   └── websocket/                # WebSocket handlers
│       ├── manager.py            # Connection manager
│       ├── redis_pubsub.py       # Redis pub/sub
│       └── handlers.py           # WS endpoints
├── frontend/                     # React PWA
│   ├── src/
│   │   ├── pages/                # Page components
│   │   ├── components/           # UI components
│   │   ├── hooks/                # Custom hooks
│   │   ├── services/             # API & WebSocket
│   │   └── store/                # Zustand state
│   └── Dockerfile
├── nginx/                        # Nginx config
├── scripts/                      # Utility scripts
├── docker-compose.yml            # Development
├── docker-compose.prod.yml       # Production
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | Database host | `localhost` |
| `POSTGRES_PORT` | Database port | `5432` |
| `POSTGRES_USER` | Database user | `postgres` |
| `POSTGRES_PASSWORD` | Database password | `postgres` |
| `POSTGRES_DB` | Database name | `virtual_queue` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_SECRET_KEY` | JWT signing key | ⚠️ Change in production! |
| `RESENDER_API_KEY` | Resend API key | Required for emails |
| `APP_BASE_URL` | Application URL | `http://localhost:8000` |
| `FRONTEND_URL` | Frontend URL | `http://localhost:3000` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Scaling

The application is designed to scale:

- **Redis Pub/Sub** enables horizontal scaling of API instances
- **1000+ customers per queue** supported with batched notifications
- **WebSocket connections** managed per-instance with Redis coordination
- **Nginx load balancing** distributes traffic across API replicas

```bash
# Scale API to 3 instances
docker compose -f docker-compose.prod.yml up -d --scale api=3
```

## Testing

```bash
# Run tests
pytest -v

# Run with coverage
pytest --cov=app
```

## Commit History

- `feat: add React PWA frontend with real-time WebSocket notifications`
- `feat: add Redis Pub/Sub for scalable messaging`
- `feat: add Nginx reverse proxy with HTTPS support`
- `feat: add user registration, email activation, JWT login, role-based dashboard`
- `feat: initialize modular FastAPI app with uv, .env, logging, and tests`

