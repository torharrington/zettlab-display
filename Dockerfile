# Minimal image: python + smartmontools for disk temps.
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends smartmontools iproute2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app.py /app/app.py
COPY static /app/static

ENV PORT=8080
EXPOSE 8080
CMD ["python3", "/app/app.py"]
