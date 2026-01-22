# AI Generated - Google Antygravity

# 🏗️ Planer Zabudowy Działki (Web MPZP)

Nowoczesna aplikacja webowa do planowania zabudowy działek, tworzenia koncepcji podziału i generowania raportów zgodności z Miejscowym Planem Zagospodarowania Przestrzennego (MPZP).

## 🚀 Funkcje

- **Interaktywna Mapa:** Wczytywanie map/skanów, kalibracja skali.
- **Rysowanie:** Intuicyjne rysowanie działek i budynków na mapie.
- **Wymiarowanie:**
  - Automatyczne wymiary krawędzi działek (dymki).
  - Wymiary budynków (szerokość/długość) przy krawędziach.
  - Powierzchnia (m²) i hektary (ha).
- **Raporty:** Generowanie profesjonalnych raportów PDF z bilansami terenu i walidacją MPZP.
- **Bezpieczeństwo:**
  - **Auto-Save:** Automatyczny zapis pracy co 30 sekund.
  - Ostrzeżenia przed utratą niezapisanych zmian.
- **Zarzadzanie:** Biblioteka map i projektów z możliwością usuwania.

## 🛠️ Instalacja i Uruchomienie

Wymagania: `Python 3.8+`, `pip`.

1. **Uruchomienie (Linux/macOS):**
   ```bash
   ./run_local.sh
   ```
   Skrypt automatycznie utworzy wirtualne środowisko, zainstaluje zależności i uruchomi serwer.

2. **Dostęp:**
   Otwórz przeglądarkę i wejdź na: `http://localhost:5000`

## 📂 Struktura Projektu

- `web_planner/` - Kod źródłowy aplikacji (Flask + Vanilla JS).
  - `app.js` - Główna logika frontendowa.
  - `server.py` - Backend w Pythonie.
- `uploads/` - (Ignorowane) Twoje wgrane mapy.
- `projects/` - (Ignorowane) Twoje zapisane projekty.

## 📜 Licencja

Ten projekt jest udostępniany na licencji **MIT**. Szczegóły znajdują się w pliku [LICENSE](LICENSE).

Copyright (c) 2026 Patryk Przydanek
