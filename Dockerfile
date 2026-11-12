FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt pyproject.toml README.md ./
COPY src ./src

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8003

CMD ["python", "-m", "uvicorn", "src.fund_agent.api:app", "--host", "0.0.0.0", "--port", "8003"]
