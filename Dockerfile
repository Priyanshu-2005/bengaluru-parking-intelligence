# Docker image for deploying the FastAPI backend as a Hugging Face Space.
# HF Spaces route external traffic to the port given by app_port in README.md (7860 here).
FROM python:3.11-slim

WORKDIR /app

# Install deps first so they cache across code-only changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend package, which includes backend/artifacts/*.parquet (the runtime data).
COPY backend/ backend/

EXPOSE 7860

# 0.0.0.0 so the container accepts external connections; HF expects the app on port 7860.
CMD ["uvicorn", "backend.api:app", "--host", "0.0.0.0", "--port", "7860"]
