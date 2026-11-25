FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
        tesseract-ocr \
        tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN if [ -f requirements.txt ]; then \
        python -m pip install --no-cache-dir -r requirements.txt; \
    elif [ -f verification_service/requirements.txt ]; then \
        python -m pip install --no-cache-dir -r verification_service/requirements.txt; \
    else \
        echo "requirements.txt not found" >&2; exit 1; \
    fi

RUN if [ -f download_models.py ]; then \
        python download_models.py; \
    else \
        cd verification_service && python download_models.py; \
    fi

EXPOSE 10000
CMD ["sh", "-c", "if [ -f main.py ]; then uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}; else cd verification_service && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}; fi"]
