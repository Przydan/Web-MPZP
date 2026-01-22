
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.transforms as transforms
from PIL import Image
import numpy as np
import os

class LandManager:
    def __init__(self, image_path, scale_px_per_m=None):
        """
        Inicjalizacja menedżera działki.
        :param image_path: Ścieżka do pliku z mapą.
        :param scale_px_per_m: Skala mapy (piksele na metr). Jeśli None, trzeba ustawić później.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Nie znaleziono pliku: {image_path}")
            
        self.image_path = image_path
        self.scale = scale_px_per_m
        self.image = Image.open(image_path)
        self.width_px, self.height_px = self.image.size

    def set_scale_from_reference(self, ref_px, ref_m):
        """Oblicza skalę na podstawie znanego odcinka."""
        self.scale = ref_px / ref_m
        print(f"Ustawiono skalę: {self.scale:.2f} px/m")

    def draw_building(self, ax, x_px, y_px, width_m, length_m, angle_deg=0, color='red', alpha=0.6, label=None):
        """
        Rysuje budynek (obrócony prostokąt) na osi mapy.
        :param ax: Oś matplotlib (axis).
        :param x_px, y_px: Współrzędne lewego górnego rogu (przed obrotem) w pikselach.
        :param width_m, length_m: Wymiary budynku w metrach.
        :param angle_deg: Kąt obrotu w stopniach (zgodnie z ruchem wskazówek zegara).
        """
        if self.scale is None:
            raise ValueError("Skala nie została zdefiniowana!")

        width_px = width_m * self.scale
        length_px = length_m * self.scale

        # Tworzenie prostokąta
        rect = patches.Rectangle((x_px, y_px), width_px, length_px, 
                                 linewidth=1, edgecolor='black', facecolor=color, alpha=alpha, label=label)

        # Transformacja obrotu
        # Obrót wokół punktu (x_px, y_px)
        t = transforms.Affine2D().rotate_deg_around(x_px, y_px, -angle_deg) + ax.transData
        rect.set_transform(t)

        ax.add_patch(rect)
        
        # Opcjonalnie: Dodanie etykiety tekstowej pośrodku
        # Obliczamy środek prostokąta po obrocie dla tekstu (prosta estymacja)
        center_x = x_px + width_px / 2
        center_y = y_px + length_px / 2
        # Tekst też można by obracać, ale czytelniej zostawić poziomo lub obrócić tak samo
        # ax.text(center_x, center_y, "DOM", transform=t, ha='center', va='center', fontsize=8, color='white', weight='bold')


    def visualize_scenario(self, scenario_data, output_file):
        """
        Generuje i zapisuje wizualizację dla danego scenariusza.
        """
        fig, ax = plt.subplots(figsize=(12, 12))
        ax.imshow(self.image)
        
        # Tytuł i Oś
        ax.set_title(f"Plan Zagospodarowania: {scenario_data['name']}\nSkala: {self.scale:.2f} px/m")
        
        # Rysowanie budynków
        for b in scenario_data['buildings']:
            # Dom
            self.draw_building(ax, b['x'], b['y'], b['w'], b['l'], b['angle'], color='red', alpha=0.6, label='Dom')
            
            # Podjazd (umieszczony relatywnie do domu - prosta heurystyka: przed domem)
            # Zakładamy, że podjazd jest np. 2m od frontu domu? 
            # Dajemy użytkownikowi pełną kontrolę w configu, ale tu dla uproszczenia
            # rysujemy go jako osobny "building" jeśli zdefiniowano w liście, 
            # albo hardcodujemy relację. Użytkownik chciał "drugi prostokąt". 
            
            # W tym kodzie `buildings` to lista obiektów do narysowania. 
            # Jeśli w configu podamy osobno dom i podjazd, będzie elastyczniej.
        
        # Legenda (tylko unikalne etykiety)
        handles, labels = plt.gca().get_legend_handles_labels()
        by_label = dict(zip(labels, handles))
        ax.legend(by_label.values(), by_label.keys(), loc='upper right')

        plt.tight_layout()
        plt.savefig(output_file, dpi=150)
        print(f"Zapisano wizualizację: {output_file}")
        plt.close(fig)

# --- KONFIGURACJA SCENARIUSZY (Hardcoded) ---

# Ścieżki do plików (zaktualizowane do nowej struktury folderów)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, 'input_images')
FILE_5_PLOTS = os.path.join(INPUT_DIR, 'wariant_5_dzialek.png') 
FILE_4_PLOTS = os.path.join(INPUT_DIR, 'wariant_4_dzialki.png')

SCENARIOS = {
    'wariant_5_dzialek': {
        'name': 'Wariant na 5 działek (Jasne tło)',
        'image_path': FILE_5_PLOTS,
        'reference_px': 400,    # SZACUNEK (do kalibracji przez użytkownika)
        'reference_m': 25.0,    # SZACUNEK
        # Lista obiektów: Dom (10x15), Podjazd (5x5). Pamiętaj o limicie zabudowy!
        'objects': [
            # --- Działka 185/12 (Góra lewo) ---
            {'x': 250, 'y': 250, 'w': 10, 'l': 15, 'angle': 45, 'type': 'house'}, 
            {'x': 260, 'y': 280, 'w': 5,  'l': 5,  'angle': 45, 'type': 'driveway'}, # Przykładowy podjazd
            
            # --- Działka 185/11 ---
            {'x': 450, 'y': 450, 'w': 10, 'l': 15, 'angle': 45, 'type': 'house'},
            
             # --- Działka 185/10 ---
            {'x': 650, 'y': 650, 'w': 10, 'l': 15, 'angle': 45, 'type': 'house'},

            # --- Działka Dół 1 (185/9?) ---
            {'x': 500, 'y': 1000, 'w': 10, 'l': 15, 'angle': 45, 'type': 'house'},

            # --- Działka Dół 2 ---
            {'x': 800, 'y': 1100, 'w': 10, 'l': 15, 'angle': 45, 'type': 'house'},
        ]
    },
    'wariant_4_dzialki': {
        'name': 'Wariant na 4 działki (Ciemne tło)',
        'image_path': FILE_4_PLOTS,
        'reference_px': 450,    # Zakładamy że linia 46.14m ma ok 450px
        'reference_m': 46.14,
        'objects': [
            # --- Działka Góra Lewo ---
            {'x': 300, 'y': 300, 'w': 10, 'l': 15, 'angle': 35, 'type': 'house'},
            
            # --- Działka Góra Prawo ---
            {'x': 700, 'y': 500, 'w': 10, 'l': 15, 'angle': 35, 'type': 'house'},

            # --- Działka Dół Lewo ---
            {'x': 400, 'y': 800, 'w': 10, 'l': 15, 'angle': 35, 'type': 'house'},

            # --- Działka Dół Prawo ---
            {'x': 800, 'y': 950, 'w': 10, 'l': 15, 'angle': 35, 'type': 'house'},
        ]
    }
}

def main():
    print("Rozpoczynanie generowania wizualizacji...")
    
    # 1. Wariant 5 działek
    s1 = SCENARIOS['wariant_5_dzialek']
    try:
        lm1 = LandManager(s1['image_path'])
        # Automatyczna kalibracja (lub ręczna jeśli wpiszeszscale_px_per_m w __init__)
        lm1.set_scale_from_reference(s1['reference_px'], s1['reference_m'])
        
        # Konwersja prostego słownika configu na format draw_building
        buildings_to_draw = []
        for obj in s1['objects']:
            color = 'red' if obj['type'] == 'house' else 'gray'
            alpha = 0.6 if obj['type'] == 'house' else 0.8
            label = 'Dom' if obj['type'] == 'house' else 'Podjazd'
            
            # Dodajemy argumenty rysowania
            buildings_to_draw.append({
                'x': obj['x'], 'y': obj['y'], 
                'w': obj['w'], 'l': obj['l'], 
                'angle': obj['angle'],
                # Dodatkowe do przekazania ręcznie w pętli wizualizacji, 
                # ale tutaj LandManager.draw_building przyjmuje argumenty, 
                # więc visualize_scenario musi być sprytne albo robimy to ręcznie tu.
            })
            
        # Aby zachować czystość LandManagera, zróbmy proste rysowanie tutaj lub rozszerzmy visualize_scenario
        # Użyjmy metody visualize_scenario, ale musimy jej przekazać listę w formacie, który rozumie.
        # Zmodyfikujmy visualize_scenario w locie klasie albo po prostu zróbmy to w main dla czytelności.
        
        fig, ax = plt.subplots(figsize=(15, 15))
        ax.imshow(lm1.image)
        ax.set_title(s1['name'])
        
        for obj in s1['objects']:
             color = 'red' if obj['type'] == 'house' else 'gray'
             label = 'Dom' if obj['type'] == 'house' else 'Podjazd'
             lm1.draw_building(ax, obj['x'], obj['y'], obj['w'], obj['l'], obj['angle'], color=color, label=label)

        # Usuwanie duplikatów w legendzie
        handles, labels = plt.gca().get_legend_handles_labels()
        by_label = dict(zip(labels, handles))
        ax.legend(by_label.values(), by_label.keys())
        
        out_path = os.path.join(BASE_DIR, 'wizualizacja_wariant_5_dzialek.png')
        plt.savefig(out_path)
        print(f"Gotowe: {out_path}")
        plt.close(fig)

    except Exception as e:
        print(f"Błąd przy wariancie 5 działek: {e}")


    # 2. Wariant 4 działki
    s2 = SCENARIOS['wariant_4_dzialki']
    try:
        lm2 = LandManager(s2['image_path'])
        lm2.set_scale_from_reference(s2['reference_px'], s2['reference_m'])
        
        fig, ax = plt.subplots(figsize=(15, 15))
        ax.imshow(lm2.image)
        ax.set_title(s2['name'])
        
        for obj in s2['objects']:
             color = 'red' if obj['type'] == 'house' else 'gray'
             label = 'Dom' if obj['type'] == 'house' else 'Podjazd'
             lm2.draw_building(ax, obj['x'], obj['y'], obj['w'], obj['l'], obj['angle'], color=color, label=label)

        handles, labels = plt.gca().get_legend_handles_labels()
        by_label = dict(zip(labels, handles))
        ax.legend(by_label.values(), by_label.keys())
        
        out_path = os.path.join(BASE_DIR, 'wizualizacja_wariant_4_dzialki.png')
        plt.savefig(out_path)
        print(f"Gotowe: {out_path}")
        plt.close(fig)

    except Exception as e:
        print(f"Błąd przy wariancie 4 działki: {e}")

if __name__ == "__main__":
    main()
