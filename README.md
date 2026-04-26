# Virtual Queue FastAPI Example

This project provides a modular FastAPI application with Postgres integration, SQLAlchemy ORM, password hashing, and Docker orchestration.

## Usage Scenarios

### 1. Everything Local (for quick development only)

```sh
uv venv
source .venv/bin/activate
uv pip install -r pyproject.toml
uvicorn app.main:app --reload
```

### 2. Everything in Docker (recommended for production or full stack integration)

```sh
docker compose up --build
```
- The API will be available at http://localhost:8000
- The Postgres database will be available at localhost:5432 (user: postgres, password: postgres, db: virtual_queue)
- The `user` table is created automatically on first run.
- **Note:** Inside Docker, `POSTGRES_HOST=db` is set automatically via `docker-compose.yml`.

### 3. App Local, Postgres in Docker (hybrid development scenario)

1. Start only the database in Docker:
   ```sh
   docker compose up db
   ```
2. In another terminal, activate your virtual environment and run the app locally:
   ```sh
   uv pip install -r pyproject.toml
   uvicorn app.main:app --reload
   ```
- **Important:** For this scenario, your `.env` must have:
  - `POSTGRES_HOST=localhost` (not `db`!)
  - `POSTGRES_PORT=5432`
  - `POSTGRES_USER=postgres`
  - `POSTGRES_PASSWORD=postgres`
  - `POSTGRES_DB=virtual_queue`

## Testing

```sh
pytest
```

## Configuration

All configuration variables (API, logging, DB connection) are in `.env`.

**Tip:**  
- Use `POSTGRES_HOST=localhost` when running the app locally (even if Postgres is in Docker).
- Use `POSTGRES_HOST=db` only when both app and Postgres run inside Docker (handled by `docker-compose.yml`).

## Project Structure

- `app/` - FastAPI source code
  - `main.py` - main application
  - `database.py` - SQLAlchemy setup and DB connection
  - `models/user.py` - User model and role enum
  - `routers/hello.py` - base router
- `tests/` - automated tests
- `.env` - environment variables
- `Dockerfile`, `docker-compose.yml` - container orchestration
- `pyproject.toml` - dependencies and build config
