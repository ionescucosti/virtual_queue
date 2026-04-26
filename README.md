# Virtual Queue FastAPI Example

This project provides a modular FastAPI application with Postgres integration, SQLAlchemy ORM, JWT authentication, email activation via Resend, role-based access control, and Docker orchestration.

## Features

- **User Registration** (Admin only) - Create users with name, lastname, username, email, and role
- **Email Activation** - Users receive activation email to set their password (via Resend)
- **JWT Authentication** - Secure login with JSON Web Tokens
- **Role-Based Access** - Three roles: ADMIN, OWNER, STAFF with different dashboard views
- **Role-Based Dashboard** - Different content displayed based on user role

## Quick Start

### 1. Start the database
```sh
docker compose up db -d
```

### 2. Install dependencies
```sh
uv venv
source .venv/bin/activate
uv pip install -r pyproject.toml
```

### 3. Update database schema (if upgrading)
```sh
python scripts/update_schema.py
```

### 4. Create initial admin user
```sh
python scripts/create_admin.py
```

### 5. Run the application
```sh
uvicorn app.main:app --reload
```

### 6. Access the application
- **API Docs**: http://localhost:8000/docs
- **Login Page**: http://localhost:8000/auth/login-page
- **Dashboard**: http://localhost:8000/dashboard

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`

## API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register new user | JWT + ADMIN role |
| GET | `/auth/activate?token=xxx` | Show password form | None |
| POST | `/auth/activate` | Set password & activate | None |
| GET | `/auth/login-page` | Login form (HTML) | None |
| POST | `/auth/login` | Get JWT token | None |
| GET | `/auth/me` | Current user info | JWT |

### Dashboard
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/dashboard` | Role-based dashboard | JWT |
| GET | `/dashboard/admin-only` | Admin-only endpoint | JWT + ADMIN |
| GET | `/dashboard/owner-staff` | Owner/Staff endpoint | JWT + OWNER/STAFF |

## Usage Scenarios

### 1. Everything Local (for quick development only)

```sh
uv venv
source .venv/bin/activate
uv pip install -r pyproject.toml
uvicorn app.main:app --reload
```

### 2. Everything in Docker (recommended for production)

```sh
docker compose up --build
```
- The API will be available at http://localhost:8000
- The Postgres database will be available at localhost:5432

### 3. App Local, Postgres in Docker (hybrid development)

1. Start only the database in Docker:
   ```sh
   docker compose up db
   ```
2. In another terminal, run the app locally:
   ```sh
   uvicorn app.main:app --reload
   ```
- **Important:** Your `.env` must have `POSTGRES_HOST=localhost`

## Testing

```sh
pytest -v
```

## Configuration

All configuration variables are in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | Database host | `localhost` |
| `POSTGRES_PORT` | Database port | `5432` |
| `POSTGRES_USER` | Database user | `postgres` |
| `POSTGRES_PASSWORD` | Database password | `postgres` |
| `POSTGRES_DB` | Database name | `virtual_queue` |
| `JWT_SECRET_KEY` | Secret key for JWT tokens | (change in production!) |
| `RESENDER_API_KEY` | Resend API key for emails | (required for activation emails) |
| `APP_BASE_URL` | Base URL for activation links | `http://localhost:8000` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Project Structure

```
app/
├── main.py              # FastAPI application entry point
├── database.py          # SQLAlchemy setup and DB connection
├── models/
│   └── user.py          # User model with roles and password hashing
├── schemas/
│   └── auth.py          # Pydantic schemas for auth endpoints
├── services/
│   ├── auth_service.py  # JWT token handling and dependencies
│   └── email_service.py # Email sending via Resend
└── routers/
    ├── auth.py          # Authentication endpoints
    └── dashboard.py     # Role-based dashboard
scripts/
├── create_admin.py      # Create initial admin user
└── update_schema.py     # Update database schema
tests/
└── test_main.py         # API tests
```
