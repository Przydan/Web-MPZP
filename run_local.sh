#!/bin/bash
# run_local.sh - Run the app locally without Docker

cd "$(dirname "$0")/web_planner" || exit 1

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate and install dependencies
source venv/bin/activate
pip install -q -r requirements.txt

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=== Starting Local Server ==="
echo "Local:   http://localhost:5000"
echo "Network: http://${LOCAL_IP}:5000"
echo "Press Ctrl+C to stop"
echo ""

# Run Flask with network access (0.0.0.0)
python -c "from server import app; app.run(host='0.0.0.0', port=5000, debug=True)"
