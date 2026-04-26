FROM python:3.10-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install uv
RUN uv pip install -r pyproject.toml

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

