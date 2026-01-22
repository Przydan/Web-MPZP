#!/bin/bash

# Configuration
APP_NAME="Planer MPZP"
VERSION_FILE="VERSION"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== $APP_NAME Installer ===${NC}"

# 0. Check Sudo/Root
if [ "$EUID" -ne 0 ]; then 
    if ! command -v sudo &> /dev/null; then
        echo -e "${RED}Błąd: Brak 'sudo' i nie jesteś rootem.${NC}"
        exit 1
    fi
    SUDO="sudo"
else
    SUDO=""
fi

# 1. Check Version
if [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(cat $VERSION_FILE)
    echo -e "Obecna wersja: ${GREEN}$CURRENT_VERSION${NC}"
else
    echo -e "${YELLOW}Brak pliku wersji (uruchamianie w trybie dev)${NC}"
    CURRENT_VERSION="dev"
fi

# 2. Check Docker & Compose
DOCKER_CMD=""
if command -v docker &> /dev/null; then
    # Prefer 'docker compose' (v2) over 'docker-compose' (v1)
    if docker compose version &> /dev/null; then
        DOCKER_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_CMD="docker-compose"
    fi
fi

if [ -n "$DOCKER_CMD" ]; then
    echo -e "Docker: ${GREEN}Zainstalowany${NC} (używam: $DOCKER_CMD)"
else
    echo -e "Docker: ${RED}Brak lub brak wtyczki Compose${NC}"
fi

# 3. Operations
echo ""
echo "Wybierz akcję:"
echo "1) Uruchom (Docker) - Zalecane"
echo "2) Uruchom (Lokalnie Python)"
echo "3) Wyczyść / Odinstaluj (Docker)"
echo "4) Wyjście"
read -p "Opcja: " OPTION

if [ "$OPTION" == "1" ]; then
    if [ -z "$DOCKER_CMD" ]; then
        echo -e "${RED}Błąd: Docker/Compose nie jest dostępny.${NC}"
        exit 1
    fi
    
    # Enter app dir
    if [ -d "web_planner" ]; then
        cd web_planner
    fi

    # Confirm Rebuild
    read -p "Czy przebudować obrazy (wymuszenie aktualizacji)? [t/N]: " REBUILD_CONFIRM
    BUILD_FLAG=""
    if [[ "$REBUILD_CONFIRM" =~ ^[tT]$ ]]; then
        BUILD_FLAG="--build"
        echo "Włączono przebudowę obrazów..."
    fi

    echo "Uruchamianie kontenera..."
    $SUDO $DOCKER_CMD up -d $BUILD_FLAG
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Aplikacja uruchomiona!${NC}"
        echo "Otwórz przeglądarkę: http://localhost:5000"
        echo "Aby zatrzymać: $SUDO $DOCKER_CMD down"
    else
        echo -e "${RED}Wystąpił błąd podczas uruchamiania Dockera.${NC}"
    fi

elif [ "$OPTION" == "2" ]; then
    # Enter app dir
    if [ -d "web_planner" ]; then
        cd web_planner
    fi

    echo "Sprawdzanie Python..."
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Błąd: Brak python3.${NC}"
        read -p "Naciśnij Enter aby wyjść..."
        exit 1
    fi

    if [ ! -d "venv" ]; then
        echo "Tworzenie środowiska wirtualnego..."
        python3 -m venv venv
    fi
    
    echo "Instalacja zależności..."
    ./venv/bin/pip install -r requirements.txt
    
    echo -e "${GREEN}Uruchamianie serwera...${NC}"
    echo "Otwórz przeglądarkę: http://localhost:5000"
    echo "Naciśnij Ctrl+C aby zatrzymać."
    ./venv/bin/python server.py
    
    echo -e "\n${YELLOW}Serwer zatrzymany.${NC}"
    read -p "Naciśnij Enter aby wyjść..."

elif [ "$OPTION" == "3" ]; then
    if [ -z "$DOCKER_CMD" ]; then
        echo -e "${RED}Błąd: Docker/Compose nie jest dostępny.${NC}"
        exit 1
    fi
    if [ -d "web_planner" ]; then cd web_planner; fi
    
    echo "Zatrzymywanie i czyszczenie kontenerów..."
    $SUDO $DOCKER_CMD down -v --rmi all --remove-orphans
    echo -e "${GREEN}Wyczyszczono.${NC}"

else
    echo "Do widzenia."
    exit 0
fi
