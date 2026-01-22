# 📘 Dokumentacja Techniczna Systemu MPZP

## 1. Architektura Systemu

System oparty jest na architekturze klient-serwer:
- **Backend (Python/Flask):** Odpowiada za serwowanie plików statycznych, obsługę API (zapis/odczyt projektów, upload obrazów) oraz zarządzanie bazą danych SQLite.
- **Frontend (Vanilla JS + HTML5 Canvas):** Cała logika edytora, renderowanie mapy, obsługa interakcji użytkownika i obliczenia geometryczne odbywają się po stronie przeglądarki.

## 2. Kluczowe Komponenty

### 2.1 Backend (`server.py`)
- **Biblioteki:** `Flask` (framework), `sqlite3` (baza), `Werkzeug` (bezpieczeństwo plików).
- **Endpointy:**
  - `GET /api/images` - Lista dostępnych podkładów mapowych.
  - `POST /api/upload` - Upload nowych map.
  - `POST /api/project/upload` - Zapis projektu (JSON + metadane).
  - `GET /projects/<filename>` - Pobieranie pliku projektu JSON.
  - `POST /api/project/<id>/delete` - Usuwanie projektu.

### 2.2 Frontend (`app.js`)
Główny silnik aplikacji. Kluczowe obiekty stanu:
- `plots[]`: Tablica obiektów działek (współrzędne wierzchołków, metadane).
- `buildings[]`: Tablica obiektów budynków (pozycja, wymiary, typ).
- `calibrationPoints[]`: Punkty używane do ustalenia skali (`scalePxPerM`).
- `camera`: Obiekt zarządzający widokiem (zoom, przesunięcie pan).

## 3. Struktury Danych (JSON Projektu)

Plik projektu (`.json`) zawiera:
```json
{
  "version": 2,
  "projectId": "uuid",
  "timestamp": 1234567890,
  "scalePxPerM": 15.5, // Piksele na metr
  "currentMapFilename": "mapa.png",
  "imgSrc": "/uploads/mapa.png",
  "calibrationPoints": [{ "x": 100, "y": 200 }, ...],
  "plots": [
    {
      "id": 1,
      "name": "Działka 1",
      "points": [{ "x": 10, "y": 10 }, ...], // Współrzędne w pikselach
      "area": 500.0, // m²
      "setbackFront": 6,
      "setbackSide": 4,
      "maxFrontage": 16
    }
  ],
  "buildings": [
    {
      "id": 1,
      "type": "house", // enum: house, garage, driveway
      "x": 50, "y": 50, // Środek budynku (px)
      "w_m": 10, "l_m": 12, // Wymiary w metrach
      "angle": 0, // Rotacja w stopniach
      "floors": 2,
      "roofAngle": 35
    }
  ]
}
```

## 4. Kluczowe Algorytmy

### 4.1 Kalibracja Skali
Użytkownik wskazuje dwa punkty na mapie i podaje rzeczywistą odległość w metrach.
`scalePxPerM = dystansPx / dystansMetry`

### 4.2 Obliczanie Powierzchni (Shoelace Formula)
Powierzchnia wielokąta działki obliczana jest wzorem Gaussa (sznurowadłowym):
`Area = 0.5 * |∑(x_i * y_{i+1} - x_{i+1} * y_i)|`
Następnie wynik konwertowany jest na m²: `AreaM2 = AreaPx / (scalePxPerM^2)`

### 4.3 Wyznaczanie Linii Zabudowy (Inset Polygon)
Do wizualizacji nieprzekraczalnych linii zabudowy używamy algorytmu przesuwania krawędzi wielokąta do wewnątrz (inset/offset).
1. Dla każdej krawędzi wielokąta określana jest wartość odsunięcia:
   - Krawędź "Frontowa" (oznaczona przez użytkownika): `setbackFront`.
   - Pozostałe krawędzie: `setbackSide`.
2. Krawędź przesuwana jest o odpowiednią wartość.
3. Wyznaczane są punkty przecięcia przesuniętych linii.

### 4.4 Rysowanie Wymiarów i Odległości
- **Działki:** Środki krawędzi są rzutowane na zewnątrz, gdzie rysowany jest "dymek" z długością.
- **Budynki:** Etykiety wymiarów (dł/szer) są pozycjonowane względem lokalnego układu współrzędnych.
- **Odległość od Frontu:** Dla zaznaczonej działki, system oblicza minimalną odległość każdego budynku od krawędzi frontowej i wizualizuje ją linią przerywaną wraz z wartością w metrach.

### 4.5 Auto-Save
Wykorzystuje `localStorage` przeglądarki.
- Co 30 sekund stan projektu jest serializowany do JSON i zapisywany pod kluczem `mpzp_autosave`.
- Przy starcie aplikacja sprawdza timestamp zapisu i proponuje przywrócenie.

## 5. Bezpieczeństwo i Walidacja
- **Backend:** Sprawdza rozszerzenia plików obrazów (`png`, `jpg`, `jpeg`) przed zapisem.
- **Frontend:** Waliduje dane wejściowe (np. wymiary budynku) i blokuje wprowadzanie wartości ujemnych.
- **Raport:** Automatycznie sprawdza zgodność wskaźników (np. szerokość elewacji) z zadanymi limitami i oznacza błędy kolorem czerwonym.
