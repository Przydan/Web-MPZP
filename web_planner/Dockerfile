FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create uploads and projects directories
RUN mkdir -p uploads projects

EXPOSE 5000

# Production server with 4 workers, 2 threads each
CMD ["gunicorn", "--workers=4", "--threads=2", "--bind=0.0.0.0:5000", "--access-logfile=-", "server:app"]
