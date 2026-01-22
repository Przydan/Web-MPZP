
# Site Plan Visualizer Walkthrough

This guide explains how to use the Python script to visualize building placements on your map images.

## 📂 File Structure

Your project is organized as follows:

- **`site_plan_visualizer.py`**: The main script.
- **`.venv/`**: Virtual environment containing installed libraries (matplotlib, PIL).

## 🚀 How to Run
### 3. Front Działki i Odległości
Dodano możliwość oznaczania frontu działki ("Ustaw Front"), co wizualizuje krawędź frontową (czerwona linia) oraz automatycznie oblicza i wyświetla odległość budynku od tej granicy.
![Wybór Frontu i Odległość](file:///home/przydan/.gemini/antigravity/brain/8319829a-afca-4d75-b359-aa7133eda046/plot_front_selected_1769066551272.png)
1. **Update Images**:
   - Place your high-resolution high-quality images in the `input_images` folder.
   - Rename them to `wariant_5_dzialek.png` (light background) and `wariant_4_dzialki.png` (dark background), OR update the filenames in the script configuration.

2. **Run the Script**:
   Open a terminal and execute:
   ```bash
   .venv/bin/python site_plan_visualizer.py
   ```

3. **Check Results**:
   The script will generate two new images in the main directory: `wizualizacja_wariant_5_dzialek.png` and `wizualizacja_wariant_4_dzialki.png`.

## ⚙️ Configuration (How to Editing the Script)

Open `site_plan_visualizer.py` in your editor. Scroll down to the `SCENARIOS` dictionary.

### 1. Adjusting Scale
Since the script uses a "pixel-per-meter" scale, you need to calibrate it for your specific images.
- Find `reference_px` and `reference_m` in the config.
- Measure a known line on your image (e.g., a plot boundary) in **pixels** (using Paint, GIMP, or Photoshop).
- Enter that pixel value into `reference_px` and the real metric length into `reference_m`.

### 2. Moving Buildings
Modify the `objects` list for each scenario.
```python
{'x': 250, 'y': 250, 'w': 10, 'l': 15, 'angle': 45, 'type': 'house'}
```
- **x, y**: Coordinates of the top-left corner (in pixels).
- **w, l**: Width and length of the building (in meters).
- **angle**: Rotation angle (degrees).
- **type**: 'house' (red) or 'driveway' (gray).

## 🖼️ Preview
Below are the dry-run visualizations generated with the initial low-res images.

