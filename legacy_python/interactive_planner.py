
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.transforms as transforms
from PIL import Image
import numpy as np
import sys
import os

class InteractiveArchitect:
    def __init__(self, image_path):
        self.image_path = image_path
        if not os.path.exists(image_path):
            print(f"Błąd: Nie znaleziono pliku {image_path}")
            sys.exit(1)
            
        self.image = Image.open(image_path)
        self.fig, self.ax = plt.subplots(figsize=(12, 10))
        self.ax.imshow(self.image)
        self.ax.set_title("Oczekuję na start...")

        # Stan aplikacji
        self.scale_px_per_m = None
        self.plot_points = []
        self.calibration_points = []
        self.building_dims = None # (width, length)
        self.building_pos = None # (x, y)
        self.building_angle = 0
        
        # Elementy graficzne
        self.poly_patch = None
        self.building_patch = None
        self.temp_line = None
        
        # Connecting events
        self.cid_click = self.fig.canvas.mpl_connect('button_press_event', self.on_click)
        self.cid_key = self.fig.canvas.mpl_connect('key_press_event', self.on_key)
        self.cid_move = self.fig.canvas.mpl_connect('motion_notify_event', self.on_move)

        self.current_step = 'CALIBRATION_START' # Steps: CALIBRATION_START, CALIBRATION_DONE, PLOT_DEF, PLOT_DONE, BUILDING_PLACE
        
        print("-" * 50)
        print("Witaj w Interaktywnym Planerze!")
        print("-" * 50)
        self.start_calibration()

    def start_calibration(self):
        self.current_step = 'CALIBRATION_1'
        self.ax.set_title("KROK 1: KALIBRACJA. Kliknij PIERWSZY punkt odcinka referencyjnego.")
        print("\n[KALIBRACJA] Kliknij na mapie pierwszy punkt odcinka o znanej długości.")
        self.fig.canvas.draw()

    def on_click(self, event):
        if event.inaxes != self.ax: return

        if self.current_step == 'CALIBRATION_1':
            self.calibration_points = [(event.xdata, event.ydata)]
            self.ax.scatter(event.xdata, event.ydata, c='red', marker='x')
            self.ax.set_title("KROK 1: Kliknij DRUGI punkt odcinka referencyjnego.")
            self.current_step = 'CALIBRATION_2'
            self.fig.canvas.draw()
            
        elif self.current_step == 'CALIBRATION_2':
            self.calibration_points.append((event.xdata, event.ydata))
            # Rysuj linię
            p1, p2 = self.calibration_points
            self.ax.plot([p1[0], p2[0]], [p1[1], p2[1]], 'r--', linewidth=2)
            self.fig.canvas.draw()
            
            # Zapytaj o długość (w konsoli)
            self.ask_for_distance()
            
        elif self.current_step == 'PLOT_DEF':
            self.plot_points.append((event.xdata, event.ydata))
            self.ax.scatter(event.xdata, event.ydata, c='green', s=20)
            
            # Rysuj obwiednię na bieżąco
            if len(self.plot_points) > 1:
                pts = np.array(self.plot_points)
                if self.poly_patch: self.poly_patch.remove()
                self.poly_patch = patches.Polygon(pts, closed=False, fill=False, edgecolor='green', linewidth=2)
                self.ax.add_patch(self.poly_patch)
                
            self.ax.set_title(f"Definiowanie działki ({len(self.plot_points)} pkt). Naciśnij INTERIT (Enter) aby zakończyć.")
            self.fig.canvas.draw()
            
        elif self.current_step == 'BUILDING_PLACE':
            self.building_pos = (event.xdata, event.ydata)
            self.draw_building(preview=False)
            print(f"\n[SUKCES] Budynek postawiony w: ({event.xdata:.1f}, {event.ydata:.1f})")
            print("Opcje: 'r' - obrót, Kliknij gdzie indziej - przesuń, 'w' - Zapisz obraz.")
            self.current_step = 'BUILDING_DONE'

        elif self.current_step == 'BUILDING_DONE':
            # Pozwalamy przestawiać
            self.building_pos = (event.xdata, event.ydata)
            self.draw_building(preview=False)
            self.fig.canvas.draw()

    def ask_for_distance(self):
        # Ze względu na pętlę zdarzeń matplotlib, input() w konsoli blokuje GUI.
        # Ale tutaj to pożądane - czekamy na input.
        plt.pause(0.1) # Daj czas na odrysowanie
        dist_px = np.sqrt((self.calibration_points[0][0] - self.calibration_points[1][0])**2 + 
                          (self.calibration_points[0][1] - self.calibration_points[1][1])**2)
        
        print(f"Odległość w pikselach: {dist_px:.2f} px")
        try:
            val_str = input("Podaj rzeczywistą długość tego odcinka w METRACH: ")
            dist_m = float(val_str.replace(',', '.'))
            self.scale_px_per_m = dist_px / dist_m
            print(f"Skala ustalona: {self.scale_px_per_m:.2f} px/m")
            
            self.current_step = 'PLOT_DEF'
            self.ax.set_title("KROK 2: Obklikaj narożniki działki (wielokąt). ENTER kończy.")
            print("\n[DZIAŁKA] Klikaj kolejne narożniki działki. Naciśnij ENTER, aby zamknąć obrys.")
            
        except ValueError:
            print("Niepoprawna liczba. Spróbujmy jeszcze raz kliknąć.")
            self.start_calibration() # Reset

    def on_key(self, event):
        if event.key == 'enter':
            if self.current_step == 'PLOT_DEF' and len(self.plot_points) >= 3:
                self.finish_plot_def()
        elif event.key == 'r':
            if self.current_step in ['BUILDING_PLACE', 'BUILDING_DONE'] and self.building_pos:
                self.building_angle = (self.building_angle + 5) % 360
                # print(f"Obrót: {self.building_angle} st")
                # Jeśli mamy podgląd (PLACE) lub już postawiony (DONE), odświeżamy
                if self.current_step == 'BUILDING_DONE':
                    self.draw_building(preview=False)
        elif event.key == 'w':
             if self.current_step == 'BUILDING_DONE':
                 filename = "wynik_interaktywny.png"
                 plt.savefig(filename)
                 print(f"Zapisano plik: {filename}")
                 self.ax.set_title(f"Zapisano jako {filename}")
                 self.fig.canvas.draw()
        elif event.key == 'escape':
            print("Anulowano.")
            sys.exit(0)

    def on_move(self, event):
        if event.inaxes != self.ax: return
        if self.current_step == 'BUILDING_PLACE':
            # Rysuj "ducha" budynku pod kursorem
            if self.building_patch: self.building_patch.remove()
            
            w_px = self.building_dims[0] * self.scale_px_per_m
            l_px = self.building_dims[1] * self.scale_px_per_m
            
            rect = patches.Rectangle((event.xdata, event.ydata), w_px, l_px, 
                                     linewidth=1, edgecolor='red', facecolor='red', alpha=0.3)
            
            t = transforms.Affine2D().rotate_deg_around(event.xdata, event.ydata, -self.building_angle) + self.ax.transData
            rect.set_transform(t)
            self.building_patch = rect
            self.ax.add_patch(rect)
            self.fig.canvas.draw()

    def finish_plot_def(self):
        # Zamknij poligon
        pts = np.array(self.plot_points)
        if self.poly_patch: self.poly_patch.remove()
        self.poly_patch = patches.Polygon(pts, closed=True, facecolor='green', alpha=0.2, edgecolor='green', linewidth=2)
        self.ax.add_patch(self.poly_patch)
        self.fig.canvas.draw()
        
        # Oblicz powierzchnię (Shoelace formula)
        x = pts[:, 0]
        y = pts[:, 1]
        area_px = 0.5 * np.abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
        area_m2 = area_px / (self.scale_px_per_m**2)
        
        print(f"\n[WYNIK] Powierzchnia działki: {area_m2:.2f} m2")
        max_footprint = area_m2 * 0.25
        print(f"Maksymalna powierzchnia zabudowy (25%): {max_footprint:.2f} m2")
        
        self.ask_for_building_dims(max_footprint)

    def ask_for_building_dims(self, max_area):
        # Reset current step to block input during question
        self.current_step = 'INPUT_WAIT'
        plt.pause(0.1)
        
        print("\n--- PROJEKTOWANIE BUDYNKU ---")
        default_w, default_l = 10.0, 14.0
        prop_area = default_w * default_l
        
        if prop_area > max_area:
            print(f"UWAGA: Standardowy dom {default_w}x{default_l} ({prop_area}m2) przekracza limit!")
        else:
            print(f"Propozycja: Dom {default_w}m x {default_l}m ({prop_area}m2).")
            
        print("Naciśnij ENTER aby zaakceptować propozycję, lub wpisz wymiary w formacie 'szerxdf' (np. 11x15).")
        val = input("Wymiary: ")
        
        if val.strip() == "":
            w, l = default_w, default_l
        else:
            try:
                parts = val.lower().split('x')
                w = float(parts[0])
                l = float(parts[1])
            except:
                print("Błąd formatu, przyjmuję standardowe 10x14.")
                w, l = 10.0, 14.0
        
        self.building_dims = (w, l)
        print(f"Wybrano dom: {w}m x {l}m.")
        
        self.current_step = 'BUILDING_PLACE'
        self.ax.set_title("KROK 3: Przesuń myszką aby celować. 'r' - obrót. KLIKNIJ aby postawić.")
        print("\n[WSTAWIANIE] Wracaj na mapę. Ruszaj myszką, 'r' obraca, kliknij aby postawić.")

    def draw_building(self, preview=False):
        if self.building_patch: self.building_patch.remove()
            
        w_px = self.building_dims[0] * self.scale_px_per_m
        l_px = self.building_dims[1] * self.scale_px_per_m
        alpha = 0.3 if preview else 0.6
        
        rect = patches.Rectangle(self.building_pos, w_px, l_px, 
                                 linewidth=1, edgecolor='black', facecolor='red', alpha=alpha, label='DOM')
        
        t = transforms.Affine2D().rotate_deg_around(self.building_pos[0], self.building_pos[1], -self.building_angle) + self.ax.transData
        rect.set_transform(t)
        self.building_patch = rect
        self.ax.add_patch(rect)
        self.ax.legend()
        self.fig.canvas.draw()


if __name__ == "__main__":
    # Domyślny obrazek jeśli nie podano argumentu
    default_img = "input_images/wariant_5_dzialek.png"
    
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
    elif os.path.exists(default_img):
        img_path = default_img
    else:
        print(f"Brak pliku {default_img}. Podaj ścieżkę jako argument.")
        sys.exit(1)
        
    app = InteractiveArchitect(img_path)
    plt.show()
