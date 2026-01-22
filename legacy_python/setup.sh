#!/bin/bash
python3 -m venv .venv
source .venv/bin/activate
pip install matplotlib pillow numpy
echo "Setup complete. Select .venv as your Python interpreter in VS Code."
