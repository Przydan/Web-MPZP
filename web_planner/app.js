
const canvas = document.getElementById('planCanvas');
const ctx = canvas.getContext('2d');

// Toast Notification Utility
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// === LOGGING UTILITY ===
const DEBUG = true;
function logAction(category, action, details = {}) {
    if (!DEBUG) return;
    const timestamp = new Date().toLocaleTimeString();
    const detailsStr = Object.keys(details).length > 0 ? JSON.stringify(details) : '';
    console.log(`[${timestamp}] [${category}] ${action}`, detailsStr);

    // Also show in UI for debugging (optional)
    if (details.showToast) {
        showToast(`${action}`, 'info', 1500);
    }
}

// === DEBOUNCE UTILITY ===
const buttonStates = {};
function debounceButton(buttonId, callback, delay = 300) {
    if (buttonStates[buttonId]) {
        logAction('UI', 'Button debounced (too fast)', { buttonId });
        return false;
    }
    buttonStates[buttonId] = true;
    setTimeout(() => { buttonStates[buttonId] = false; }, delay);
    callback();
    return true;
}

// === CUSTOM MODAL CONFIRM ===
function customConfirm(title, message, confirmText = 'Usuń', confirmClass = 'danger') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalConfirm = document.getElementById('modalConfirm');
        const modalCancel = document.getElementById('modalCancel');

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalConfirm.textContent = confirmText;
        modalConfirm.className = `btn ${confirmClass}`;

        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            modalConfirm.onclick = null;
            modalCancel.onclick = null;
        };

        modalConfirm.onclick = () => { cleanup(); resolve(true); };
        modalCancel.onclick = () => { cleanup(); resolve(false); };
        modal.onclick = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };
    });
}

// === SYNC btnFinishPlot STATE ===
function syncFinishPlotButton() {
    const btn = document.getElementById('btnFinishPlot');
    if (btn) {
        const wasDisabled = btn.disabled;
        btn.disabled = currentPlotPoints.length < 3;
        if (wasDisabled !== btn.disabled) {
            logAction('UI', 'btnFinishPlot state changed', {
                disabled: btn.disabled,
                pointsCount: currentPlotPoints.length
            });
        }
    }
}

// --- STATE ---
let img = new Image();
let scalePxPerM = 0;
let currentMode = 'NONE';
let activeTool = 'SELECT';

let mouse = { x: 0, y: 0 };

// Camera
let camera = {
    zoom: 1,
    offset: { x: 0, y: 0 },
    isPanning: false,
    startPan: { x: 0, y: 0 }
};

// Data
let calibrationPoints = [];
let plots = [];
let currentPlotPoints = [];
let buildings = [];
let nextPlotId = 1;

// Selection
let selectedBuildingIndex = -1;
let selectedPlotIndex = -1;
let draggedVertexIndex = -1;
let dragOffset = { x: 0, y: 0 };
let keysPressed = {};

// Library State
let libraryImages = [];
let selectedLibImageId = null;
let currentMapFilename = null; // Track currently loaded map

// === AUTO-SAVE STATE ===
let projectId = null;
let lastSaveTime = null;
let hasUnsavedChanges = false;
let autoSaveInterval = null;
const AUTO_SAVE_KEY = 'mpzp_autosave';
const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

// Generate unique project ID
function generateProjectId() {
    return 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Mark project as having unsaved changes
function markAsUnsaved() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        logAction('PROJECT', 'Changes detected - unsaved');
    }
}

// Mark project as saved
function markAsSaved() {
    hasUnsavedChanges = false;
    lastSaveTime = new Date();
    logAction('PROJECT', 'Project saved', { time: lastSaveTime.toLocaleTimeString() });
}

// Get current project data
function getProjectData() {
    let srcToSave = null;
    if (img.src) {
        if (img.src.includes('/uploads/')) {
            const parts = img.src.split('/uploads/');
            srcToSave = '/uploads/' + parts[1];
        } else if (img.src.length < 5000000) {
            srcToSave = img.src;
        }
    }

    return {
        version: 2,
        projectId: projectId,
        timestamp: Date.now(),
        scalePxPerM,
        calibrationPoints,
        plots,
        buildings,
        imgSrc: srcToSave,
        currentMapFilename
    };
}

// Auto-save to LocalStorage
function autoSaveToLocalStorage() {
    if (!projectId) projectId = generateProjectId();

    const projectData = getProjectData();

    try {
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(projectData));
        logAction('AUTO-SAVE', 'Saved to LocalStorage', {
            plots: plots.length,
            buildings: buildings.length
        });
        showToast('Auto-zapis ✓', 'info', 1500);
    } catch (e) {
        logAction('AUTO-SAVE', 'Failed to save', { error: e.message });
        console.error('Auto-save failed:', e);
    }
}

// Load from LocalStorage
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem(AUTO_SAVE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.error('Failed to load auto-save:', e);
        return null;
    }
}

// Clear auto-save
function clearAutoSave() {
    localStorage.removeItem(AUTO_SAVE_KEY);
    logAction('AUTO-SAVE', 'Cleared');
}

// Start auto-save interval
function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
        if (hasUnsavedChanges && (plots.length > 0 || buildings.length > 0 || calibrationPoints.length > 0)) {
            autoSaveToLocalStorage();
        }
    }, AUTO_SAVE_INTERVAL_MS);
    logAction('AUTO-SAVE', 'Started', { intervalMs: AUTO_SAVE_INTERVAL_MS });
}

// Check for auto-save on startup
function checkForAutoSave() {
    const saved = loadFromLocalStorage();
    if (saved && (saved.plots?.length > 0 || saved.buildings?.length > 0)) {
        const saveDate = new Date(saved.timestamp);
        const timeAgo = Math.round((Date.now() - saved.timestamp) / 60000);

        if (confirm(`Znaleziono auto-zapis z ${saveDate.toLocaleString()} (${timeAgo} min temu).\n\nDzia\u0142ki: ${saved.plots?.length || 0}, Budynki: ${saved.buildings?.length || 0}\n\nCzy chcesz wczyta\u0107?`)) {
            // Restore project
            projectId = saved.projectId || generateProjectId();
            scalePxPerM = saved.scalePxPerM || 0;
            calibrationPoints = saved.calibrationPoints || [];
            plots = saved.plots || [];
            buildings = saved.buildings || [];
            currentMapFilename = saved.currentMapFilename;

            if (saved.imgSrc) {
                const name = saved.imgSrc.split('/').pop();
                loadImageOnly(saved.imgSrc, name);
            } else {
                updateUI();
                draw();
            }

            showToast('Projekt wczytany z auto-zapisu!', 'success');
            logAction('AUTO-SAVE', 'Restored project', { projectId });
            updateUI();
        } else {
            // User declined, ask if they want to clear it
            if (confirm('Czy usun\u0105\u0107 auto-zapis?')) {
                clearAutoSave();
            }
        }
    }
}

// Warning before closing with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        autoSaveToLocalStorage(); // Force save before closing
        e.preventDefault();
        return 'Masz niezapisane zmiany!';
    }
});

// --- UI REFS ---
const plotNameInput = document.getElementById('plotNameInput');
const setbackFrontInput = document.getElementById('setbackFrontInput');
const setbackSideInput = document.getElementById('setbackSideInput');
const maxFrontageInput = document.getElementById('maxFrontageInput');
const plotListDiv = document.getElementById('libList'); // Using lib list as temp or need to re-bind plot list? Wait, I removed plotListDiv in HTML?
// Check HTML: I likely removed plotListDiv container based on diff? 
// No, I just replaced the inner content of panel 3. I need to make sure I didn't break the list.
// The previous HTML had `plotListDiv` inside the sidebar? No, it was just appended?
// Actually, I see I removed `maxBuildPercentInput` etc.

// New Refs
const bTypeInput = document.getElementById('bType');
const bWidthInput = document.getElementById('bWidth');
const bLengthInput = document.getElementById('bLength');
const bFloorsInput = document.getElementById('bFloors');
const bRoofInput = document.getElementById('bRoof');
const bHeightInput = document.getElementById('bHeight');
const areaDisplay = document.getElementById('areaDisplay');
const calibrationInputDiv = document.getElementById('calibrationInput');
const scaleDisplay = document.getElementById('scaleDisplay');

// Balance Refs
const valFAR = document.getElementById('valFAR');
const statusFAR = document.getElementById('statusFAR');
const valGreen = document.getElementById('valGreen');
const statusGreen = document.getElementById('statusGreen');
const valParking = document.getElementById('valParking');
const statusParking = document.getElementById('statusParking');

// --- TOOLS ---
function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.tool').forEach(el => el.classList.remove('active'));

    if (tool === 'SELECT') document.getElementById('toolSelect').classList.add('active');
    if (tool === 'PAN') document.getElementById('toolPan').classList.add('active');
    if (tool === 'DRAW') document.getElementById('toolDraw').classList.add('active');

    if (tool !== 'DRAW' && currentMode === 'PLOT_DRAW') {
        currentMode = 'NONE';
        currentPlotPoints = [];
    }
    draw();
}

document.getElementById('toolSelect').onclick = () => setTool('SELECT');
document.getElementById('toolPan').onclick = () => setTool('PAN');
document.getElementById('toolDraw').onclick = () => setTool('DRAW');


// --- 1. LIBRARY (MAPS & PROJECTS) ---

// UI Vars
const tabMaps = document.getElementById('tabMaps');
const tabProjects = document.getElementById('tabProjects');
const viewMaps = document.getElementById('viewMaps');
const viewProjects = document.getElementById('viewProjects');

// Open Library
document.getElementById('btnOpenLibrary').onclick = () => {
    document.getElementById('libraryModal').style.display = 'flex';
    switchTab('MAPS'); // Default
};
document.getElementById('btnCloseLibrary').onclick = () => {
    document.getElementById('libraryModal').style.display = 'none';
};

// Tabs
tabMaps.onclick = () => switchTab('MAPS');
tabProjects.onclick = () => switchTab('PROJECTS');

function switchTab(tab) {
    if (tab === 'MAPS') {
        tabMaps.classList.add('primary'); tabMaps.classList.remove('secondary');
        tabProjects.classList.add('secondary'); tabProjects.classList.remove('primary');
        viewMaps.style.display = 'flex';
        viewProjects.style.display = 'none';
        fetchLibrary();
    } else {
        tabProjects.classList.add('primary'); tabProjects.classList.remove('secondary');
        tabMaps.classList.add('secondary'); tabMaps.classList.remove('primary');
        viewProjects.style.display = 'flex';
        viewMaps.style.display = 'none';
        fetchProjects();
    }
}

// === MAPS LOGIC ===
function fetchLibrary() {
    fetch('/api/images')
        .then(res => res.json())
        .then(data => {
            libraryImages = data;
            renderLibrary();
        })
        .catch(err => {
            console.error('Błąd pobierania biblioteki:', err);
            showToast('Błąd ładowania biblioteki map', 'error');
        });
}
// ... (RenderLibrary - existing logic)


// === PROJECTS LOGIC ===
let libraryProjects = [];
let selectedProjId = null;

function fetchProjects() {
    fetch('/api/projects')
        .then(res => res.json())
        .then(data => {
            libraryProjects = data;
            renderProjects();
        })
        .catch(err => {
            console.error('Błąd pobierania projektów:', err);
            showToast('Błąd ładowania projektów', 'error');
        });
}

function renderProjects() {
    const list = document.getElementById('projList');
    list.innerHTML = '';

    libraryProjects.forEach(proj => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.border = (selectedProjId === proj.id) ? '2px solid blue' : '1px solid #eee';
        div.style.cursor = 'pointer';
        div.style.background = '#fff';

        div.innerHTML = `
            <div style="font-weight:bold">${proj.description || 'Bez opisu'}</div>
            <div style="font-size:0.8em; color:#666">${new Date(proj.upload_date).toLocaleString()}</div>
        `;

        div.onclick = () => selectProject(proj);
        div.ondblclick = () => loadProjectFromServer(proj.filename); // Quick Load
        list.appendChild(div);
    });
}

function selectProject(proj) {
    selectedProjId = proj.id;
    renderProjects();

    document.getElementById('selectedProjDetails').style.display = 'flex';
    document.getElementById('selProjName').innerText = proj.original_name;
    document.getElementById('selProjDate').innerText = new Date(proj.upload_date).toLocaleString();
    document.getElementById('selProjDescDisplay').innerText = proj.description || '';

    document.getElementById('btnLoadProj').onclick = () => loadProjectFromServer(proj.filename);
    document.getElementById('btnDeleteProj').onclick = async () => {
        const confirmed = await customConfirm(
            'Usuń Projekt',
            `Czy na pewno chcesz usunąć projekt "${proj.original_name}"?`,
            'Usuń',
            'danger'
        );
        if (confirmed) {
            fetch(`/api/project/${proj.id}/delete`, { method: 'POST' })
                .then(() => {
                    selectedProjId = null;
                    document.getElementById('selectedProjDetails').style.display = 'none';
                    fetchProjects();
                    showToast('Projekt usunięty', 'success');
                })
                .catch(err => showToast('Błąd usuwania', 'error'));
        }
    };
}

// Save Project to Cloud
document.getElementById('btnServerSaveProj').onclick = () => {
    // Generate JSON logic (reused from saveProject)
    let srcToSave = null;
    if (img.src) {
        if (img.src.includes('/uploads/')) {
            const parts = img.src.split('/uploads/');
            srcToSave = '/uploads/' + parts[1];
        } else if (img.src.length < 5000000) { srcToSave = img.src; }
    }
    const project = {
        version: 1, scalePxPerM, plots, buildings, imgSrc: srcToSave
    };

    const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
    const formData = new FormData();
    formData.append('file', blob, `projekt_${Date.now()}.json`);
    formData.append('description', document.getElementById('saveProjDesc').value || 'Mój Projekt');

    fetch("/api/project/upload", { method: "POST", body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                markAsSaved();
                showToast("Projekt zapisany w chmurze!", "success");
                document.getElementById("saveProjDesc").value = "";
                fetchProjects();
            } else {
                showToast("Błąd zapisu: " + data.error, "error");
            }
        })
        .catch(err => showToast("Błąd serwera", "error"));
};

function loadProjectFromServer(filename) {
    fetch(`/projects/${filename}`)
        .then(res => res.json())
        .then(data => {
            // Load project data FIRST
            scalePxPerM = data.scalePxPerM || 0;
            calibrationPoints = data.calibrationPoints || [];
            plots = data.plots || [];
            buildings = data.buildings || [];

            // Recalculate nextPlotId
            nextPlotId = plots.reduce((max, p) => Math.max(max, (p.id || 0) + 1), 1);

            logAction('PROJECT', 'Loading from server', {
                filename,
                plots: plots.length,
                buildings: buildings.length
            });

            if (data.imgSrc) {
                const name = data.imgSrc.split('/').pop();
                // Use loadImageOnly to NOT reset data
                loadImageOnly(data.imgSrc, name, (success) => {
                    if (success) {
                        showToast('Projekt wczytany!', 'success');
                    }
                });
            } else {
                updateUI();
                draw();
                showToast('Projekt wczytany (bez mapy)', 'info');
            }

            document.getElementById('libraryModal').style.display = 'none';
            hasUnsavedChanges = false;
        })
        .catch(err => {
            console.error('Load project error:', err);
            showToast('Błąd wczytywania projektu', 'error');
        });
}



function renderLibrary() {
    const list = document.getElementById('libList');
    list.innerHTML = '';

    libraryImages.forEach(imgData => {
        const div = document.createElement('div');
        div.style.position = 'relative';

        let border = '1px solid #ddd';
        if (selectedLibImageId === imgData.id) border = '3px solid blue';
        if (currentMapFilename === imgData.filename) border = '3px solid #28a745'; // Green for Active

        div.style.border = border;
        div.style.cursor = 'pointer';
        div.style.padding = '5px';
        div.style.textAlign = 'center';
        div.style.borderRadius = '4px';

        const thumb = document.createElement('img');
        thumb.src = `/uploads/${imgData.filename}`;
        thumb.style.width = '80px';
        thumb.style.height = '80px';
        thumb.style.objectFit = 'cover';

        const caption = document.createElement('div');
        caption.innerText = imgData.original_name.substring(0, 10) + '...';
        caption.style.fontSize = '0.7rem';

        div.appendChild(thumb);
        div.appendChild(caption);

        // Badge for Active
        if (currentMapFilename === imgData.filename) {
            const badge = document.createElement('div');
            badge.innerText = 'AKTYWNA';
            badge.style.position = 'absolute';
            badge.style.top = '0';
            badge.style.right = '0';
            badge.style.background = '#28a745';
            badge.style.color = 'white';
            badge.style.fontSize = '0.6rem';
            badge.style.padding = '2px 4px';
            badge.style.borderRadius = '0 0 0 4px';
            div.appendChild(badge);
        }

        div.onclick = () => selectLibImage(imgData);
        div.ondblclick = () => {
            setupImage(`/uploads/${imgData.filename}`, imgData.original_name, imgData.filename);
            document.getElementById('libraryModal').style.display = 'none';
        };
        list.appendChild(div);
    });
}

function selectLibImage(imgData) {
    selectedLibImageId = imgData.id;
    renderLibrary(); // Re-render to show selection border

    const details = document.getElementById('selectedImageDetails');
    details.style.display = 'flex';

    document.getElementById('selImgName').innerText = imgData.original_name + ` (${new Date(imgData.upload_date).toLocaleDateString()})`;
    document.getElementById('selImgPreview').src = `/uploads/${imgData.filename}`;
    document.getElementById('selImgDesc').value = imgData.description || '';

    document.getElementById('btnLoadMap').onclick = () => {
        setupImage(`/uploads/${imgData.filename}`, imgData.original_name, imgData.filename);
        document.getElementById('libraryModal').style.display = 'none';
    };

    document.getElementById('btnUpdateDesc').onclick = () => {
        const newDesc = document.getElementById('selImgDesc').value;
        fetch(`/api/image/${imgData.id}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: newDesc })
        }).then(() => fetchLibrary());
    };

    document.getElementById('btnDeleteMap').onclick = async () => {
        const confirmed = await customConfirm(
            'Usuń Mapę',
            `Czy na pewno chcesz usunąć mapę "${imgData.original_name}"?`,
            'Usuń',
            'danger'
        );
        if (confirmed) {
            fetch(`/api/image/${imgData.id}/delete`, { method: 'POST' })
                .then(() => {
                    selectedLibImageId = null;
                    document.getElementById('selectedImageDetails').style.display = 'none';
                    fetchLibrary();
                    showToast('Mapa usunięta', 'success');
                })
                .catch(err => showToast('Błąd usuwania', 'error'));
        }
    };
}

// Upload
document.getElementById('btnServerUpload').onclick = () => {
    const input = document.getElementById('serverFileInput');
    const desc = document.getElementById('uploadDesc').value;
    if (!input.files[0]) return alert("Wybierz plik!");

    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('description', desc);

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Wgrano!');
                input.value = '';
                document.getElementById('uploadDesc').value = '';
                fetchLibrary();
            } else {
                alert('Błąd: ' + data.error);
            }
        });
};


function setupImage(src, name, serverFilename = null) {
    if (!src) return alert('Błąd: Brak ścieżki do obrazu!');

    img = new Image();
    img.onerror = () => {
        alert('BŁĄD ŁADOWANIA OBRAZU:\nNie udało się załadować pliku: ' + src + '\nSprawdź czy plik istnieje na serwerze.');
    };

    img.onload = () => {
        // Force dimension update
        if (canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }

        if (canvas.width === 0 || canvas.height === 0) {
            // Silently attempt fallback, ResizeObserver will fix this shortly
            canvas.width = 800;
            canvas.height = 600;
        }

        // Reset
        if (serverFilename) {
            currentMapFilename = serverFilename;
        } else if (src.startsWith('/uploads/')) {
            currentMapFilename = src.split('/').pop();
        } else {
            currentMapFilename = null;
        }

        calibrationPoints = [];
        // plots = []; // Don't clear plots if just reloading image? Or maybe user wants fresh start?
        // User workflow: "Otwórz Bibliotekę" -> Load Map. Usually implies new project base.
        // For safety, let's keep current behavior (clearing plots) unless loading project.
        plots = [];
        buildings = [];
        currentPlotPoints = [];
        scalePxPerM = 0;
        nextPlotId = 1;

        // Calc Zoom
        const rx = canvas.width / img.width;
        const ry = canvas.height / img.height;
        camera.zoom = Math.min(rx, ry) * 0.9;

        if (!camera.zoom || camera.zoom === Infinity) {
            alert('BŁĄD ZOOM: Niepoprawny zoom (' + camera.zoom + '). Wymiary obrazu: ' + img.width + 'x' + img.height);
            camera.zoom = 0.1;
        }

        camera.offset.x = (canvas.width - img.width * camera.zoom) / 2;
        camera.offset.y = (canvas.height - img.height * camera.zoom) / 2;

        document.getElementById('currentMapName').innerText = name || 'Mapa wczytana';
        document.getElementById('calibrationPanel').style.display = 'block';
        updateUI();
        draw();

        // alert('Sukces: Obraz załadowany.\nZoom: ' + camera.zoom.toFixed(4) + '\nWymiary: ' + img.width + 'x' + img.height);
    };
    img.src = src;
}

// Load image only - WITHOUT resetting project data (for loading saved projects)
function loadImageOnly(src, name, callback = null) {
    if (!src) {
        console.error('loadImageOnly: No source provided');
        if (callback) callback(false);
        return;
    }

    img = new Image();
    img.onerror = () => {
        console.error('loadImageOnly: Failed to load image:', src);
        showToast('Błąd ładowania obrazu', 'error');
        if (callback) callback(false);
    };

    img.onload = () => {
        // Update canvas size
        if (canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth || 800;
            canvas.height = canvas.parentElement.clientHeight || 600;
        }

        // Update filename tracking
        if (src.startsWith('/uploads/')) {
            currentMapFilename = src.split('/').pop();
        }

        // Calculate zoom to fit
        const rx = canvas.width / img.width;
        const ry = canvas.height / img.height;
        camera.zoom = Math.min(rx, ry) * 0.9;

        if (!camera.zoom || camera.zoom === Infinity || isNaN(camera.zoom)) {
            camera.zoom = 0.5;
        }

        camera.offset.x = (canvas.width - img.width * camera.zoom) / 2;
        camera.offset.y = (canvas.height - img.height * camera.zoom) / 2;

        document.getElementById('currentMapName').innerText = name || 'Mapa projektu';
        document.getElementById('calibrationPanel').style.display = 'block';

        updateUI();
        draw();

        logAction('PROJECT', 'Image loaded (preserving data)', { src: src.substring(0, 50) });
        if (callback) callback(true);
    };

    img.src = src;
}

// --- UI INIT (Project Panel) ---
(function initUI() {
    const sidebar = document.querySelector('.sidebar');
    const existing = document.getElementById('projectPanel');
    if (existing) return; // Prevent double init if re-run

    const projPanel = document.createElement('div');
    projPanel.id = 'projectPanel';
    projPanel.className = 'panel';
    projPanel.innerHTML = `
        <h3>Projekt</h3>
        <div class="json-controls">
            <button id="btnSaveJson" class="btn secondary">Zapisz (JSON)</button>
            <button id="btnLoadJson" class="btn secondary">Wczytaj</button>
            <input type="file" id="jsonInput" accept=".json" style="display:none">
        </div>
        <button id="btnReport" class="btn warning">Raport PDF</button>
    `;
    sidebar.insertBefore(projPanel, sidebar.firstChild);

    document.getElementById('btnSaveJson').onclick = saveProject;
    document.getElementById('btnLoadJson').onclick = () => document.getElementById('jsonInput').click();
    document.getElementById('jsonInput').onchange = loadProject;
    document.getElementById('btnReport').onclick = openReport;
})();

function saveProject() {
    // If img.src is from our server (starts with /uploads/), save that path
    // If it's dataUri (legacy), save it.
    let srcToSave = null;
    if (img.src) {
        if (img.src.includes('/uploads/')) {
            // Extract relative path
            const parts = img.src.split('/uploads/');
            srcToSave = '/uploads/' + parts[1];
        } else if (img.src.length < 5000000) {
            srcToSave = img.src;
        }
    }

    const project = {
        version: 1,
        scalePxPerM,
        plots,
        buildings,
        imgSrc: srcToSave
    };
    const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projekt_mpzp_${Date.now()}.json`;
    a.click();
    markAsSaved();
    showToast('Projekt zapisany!', 'success');
}

function loadProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = JSON.parse(evt.target.result);

            // Load project data
            scalePxPerM = data.scalePxPerM || 0;
            calibrationPoints = data.calibrationPoints || [];
            plots = data.plots || [];
            buildings = data.buildings || [];
            projectId = data.projectId || generateProjectId();
            currentMapFilename = data.currentMapFilename || null;

            // Recalculate nextPlotId
            nextPlotId = plots.reduce((max, p) => Math.max(max, (p.id || 0) + 1), 1);

            logAction('PROJECT', 'Loaded from local file', {
                plots: plots.length,
                buildings: buildings.length
            });

            if (data.imgSrc) {
                const name = data.imgSrc.split('/').pop();
                loadImageOnly(data.imgSrc, name, (success) => {
                    if (success) showToast('Projekt wczytany z pliku!', 'success');
                });
            } else {
                updateUI();
                draw();
                showToast('Projekt wczytany (bez mapy)', 'info');
            }

            hasUnsavedChanges = false;
        } catch (err) {
            console.error('JSON Parse error:', err);
            showToast("Błąd pliku JSON", 'error');
        }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
    e.target.value = '';
}

function openReport() {
    const win = window.open('', '_blank');

    // Calculate totals
    const totalPlotArea = plots.reduce((sum, p) => sum + (p.area || 0), 0);
    const totalBuildingArea = buildings.reduce((sum, b) => sum + (b.w_m * b.l_m), 0);
    const buildingsByType = {
        house: buildings.filter(b => b.type === 'house'),
        garage: buildings.filter(b => b.type === 'garage'),
        driveway: buildings.filter(b => b.type === 'driveway')
    };

    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Raport MPZP - ${new Date().toLocaleDateString()}</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; }
    h3 { color: #7f8c8d; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #bdc3c7; padding: 10px; text-align: left; }
    th { background: #3498db; color: white; }
    tr:nth-child(even) { background: #ecf0f1; }
    .summary-box { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
    .summary-item { text-align: center; padding: 10px; background: white; border-radius: 4px; }
    .summary-item .value { font-size: 24px; font-weight: bold; color: #2c3e50; }
    .summary-item .label { font-size: 12px; color: #7f8c8d; }
    .ok { color: #27ae60; } .warn { color: #f39c12; } .error { color: #e74c3c; }
    .map-img { max-width: 100%; border: 2px solid #333; border-radius: 4px; margin: 15px 0; }
    @media print { .no-print { display: none; } }
</style>
</head><body>
<h1>🏗️ Raport Planistyczny MPZP</h1>
<p><strong>Data wygenerowania:</strong> ${new Date().toLocaleString()}</p>

<div class="summary-box">
    <h3>📊 Podsumowanie</h3>
    <div class="summary-grid">
        <div class="summary-item">
            <div class="value">${plots.length}</div>
            <div class="label">Działek</div>
        </div>
        <div class="summary-item">
            <div class="value">${buildings.length}</div>
            <div class="label">Budynków</div>
        </div>
        <div class="summary-item">
            <div class="value">${totalPlotArea.toFixed(0)} m²</div>
            <div class="label">Łączna pow. działek</div>
        </div>
    </div>
</div>

<img src="${canvas.toDataURL()}" class="map-img" alt="Mapa projektu"/>

<h2>📋 Zestawienie Działek</h2>
<table>
    <tr>
        <th>Nazwa</th>
        <th>Powierzchnia</th>
        <th>Front</th>
        <th>Boki</th>
        <th>Max szer. elew.</th>
        <th>Budynki na działce</th>
    </tr>`;

    plots.forEach(p => {
        if (!p.visible) return;

        // Count buildings on this plot (simplified - just count all for now)
        const buildingsOnPlot = buildings.length > 0 ? `${buildings.length} (całość)` : '0';

        html += `<tr>
            <td>${p.name || 'Bez nazwy'}</td>
            <td>${(p.area || 0).toFixed(2)} m² (${((p.area || 0) / 10000).toFixed(4)} ha)</td>
            <td>${p.setbackFront || 6} m</td>
            <td>${p.setbackSide || 4} m</td>
            <td>${p.maxFrontage || 16} m</td>
            <td>${buildingsOnPlot}</td>
        </tr>`;
    });

    html += `</table>

<h2>🏠 Zestawienie Budynków</h2>
<table>
    <tr>
        <th>Typ</th>
        <th>Wymiary (szer. × dł.)</th>
        <th>Powierzchnia</th>
        <th>Kondygnacje</th>
        <th>Kąt dachu</th>
    </tr>`;

    buildings.forEach((b, i) => {
        const typeName = b.type === 'house' ? 'Dom' : (b.type === 'garage' ? 'Garaż' : 'Podjazd');
        html += `<tr>
            <td>${typeName}</td>
            <td>${b.w_m.toFixed(1)} × ${b.l_m.toFixed(1)} m</td>
            <td>${(b.w_m * b.l_m).toFixed(2)} m²</td>
            <td>${b.type === 'house' ? b.floors : '-'}</td>
            <td>${b.type === 'house' ? b.roofAngle + '°' : '-'}</td>
        </tr>`;
    });

    html += `</table>

<h2>📐 Wskaźniki Zabudowy</h2>
<div class="summary-box">
    <table>
        <tr>
            <td><strong>Łączna pow. zabudowy:</strong></td>
            <td>${totalBuildingArea.toFixed(2)} m²</td>
        </tr>
        <tr>
            <td><strong>Intensywność zabudowy:</strong></td>
            <td>${totalPlotArea > 0 ? ((totalBuildingArea / totalPlotArea) * 100).toFixed(1) : 0}%</td>
        </tr>
        <tr>
            <td><strong>Domy:</strong></td>
            <td>${buildingsByType.house.length} szt. (${buildingsByType.house.reduce((s, b) => s + b.w_m * b.l_m, 0).toFixed(1)} m²)</td>
        </tr>
        <tr>
            <td><strong>Garaże:</strong></td>
            <td>${buildingsByType.garage.length} szt. (${buildingsByType.garage.reduce((s, b) => s + b.w_m * b.l_m, 0).toFixed(1)} m²)</td>
        </tr>
        <tr>
            <td><strong>Podjazdy:</strong></td>
            <td>${buildingsByType.driveway.length} szt. (${buildingsByType.driveway.reduce((s, b) => s + b.w_m * b.l_m, 0).toFixed(1)} m²)</td>
        </tr>
    </table>
</div>

<h2>⚠️ Walidacja MPZP</h2>
<table>
    <tr><th>Sprawdzenie</th><th>Status</th><th>Uwagi</th></tr>`;

    // Validation checks
    const houseWidthOk = !buildings.some(b => b.type === 'house' && b.w_m > 16);
    const garageWidthOk = !buildings.some(b => b.type === 'garage' && b.w_m > 8);

    html += `
    <tr>
        <td>Szerokość elewacji domu ≤ 16m</td>
        <td class="${houseWidthOk ? 'ok' : 'error'}">${houseWidthOk ? '✅ OK' : '❌ PRZEKROCZONO'}</td>
        <td>${houseWidthOk ? '-' : 'Max dozwolona: 16m'}</td>
    </tr>
    <tr>
        <td>Szerokość garażu ≤ 8m</td>
        <td class="${garageWidthOk ? 'ok' : 'error'}">${garageWidthOk ? '✅ OK' : '❌ PRZEKROCZONO'}</td>
        <td>${garageWidthOk ? '-' : 'Max dozwolona: 8m'}</td>
    </tr>`;

    html += `</table>

<p class="no-print" style="margin-top: 30px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 30px; font-size: 16px; cursor: pointer;">
        🖨️ Drukuj Raport
    </button>
</p>

</body></html>`;

    win.document.write(html);
    win.document.close();
}


// --- CANVAS EVENTS ---

canvas.addEventListener('mousedown', (e) => {
    // 1. PAN
    if (e.button === 1 || keysPressed[' '] || (activeTool === 'PAN' && e.button === 0)) {
        camera.isPanning = true;
        camera.startPan = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (e.button !== 0) return;

    const { x, y } = getMousePos(e);
    const snap = getSnappedPos(x, y);

    // 2. CALIBRATION
    if (currentMode === 'CALIBRATE') {
        calibrationPoints.push(snap);
        if (calibrationPoints.length === 2) {
            calibrationInputDiv.style.display = 'block';
            currentMode = 'NONE';
            setTool('SELECT');
        }
        return;
    }

    // 3. DRAW TOOL
    if (activeTool === 'DRAW') {
        if (currentMode !== 'PLOT_DRAW') {
            currentMode = 'PLOT_DRAW';
            currentPlotPoints = [];
            logAction('PLOT', 'Started drawing new plot');
        }

        if (currentPlotPoints.length > 2) {
            const start = currentPlotPoints[0];
            const d = Math.sqrt((snap.x - start.x) ** 2 + (snap.y - start.y) ** 2);
            if (d < 10 / camera.zoom) {
                logAction('PLOT', 'Closing plot by clicking near start point', { pointsCount: currentPlotPoints.length });
                plots.push({
                    points: currentPlotPoints,
                    color: 'rgba(0, 255, 0, 0.2)',
                    area: computePolygonAreaM2(currentPlotPoints, scalePxPerM),
                    visible: true,
                    name: `Działka ${nextPlotId++}`,
                    setbackFront: parseFloat(setbackFrontInput.value) || 6,
                    setbackSide: parseFloat(setbackSideInput.value) || 4,
                    maxFrontage: parseFloat(maxFrontageInput.value) || 16
                });
                selectPlot(plots.length - 1);
                currentMode = 'NONE';
                currentPlotPoints = [];
                setTool('SELECT');
                syncFinishPlotButton();
                logAction('PLOT', 'Plot created via canvas click', { plotIndex: plots.length - 1 });
                showToast('Działka utworzona!', 'success');
                markAsUnsaved();
                return;
            }
        }
        currentPlotPoints.push(snap);
        syncFinishPlotButton();
        logAction('PLOT', 'Point added via canvas', { pointIndex: currentPlotPoints.length, x: snap.x.toFixed(0), y: snap.y.toFixed(0) });
        return;
    }

    // 4. SELECTION
    if (activeTool === 'SELECT') {
        if (selectedPlotIndex !== -1 && plots[selectedPlotIndex].visible) {
            const poly = plots[selectedPlotIndex];
            for (let i = 0; i < poly.points.length; i++) {
                const p = poly.points[i];
                const pScreen = worldToScreen(p.x, p.y);
                const mScreen = worldToScreen(x, y);
                if (Math.hypot(pScreen.x - mScreen.x, pScreen.y - mScreen.y) < 10) {
                    currentMode = 'PLOT_EDIT_VERTEX';
                    draggedVertexIndex = i;
                    return;
                }
            }
        }

        for (let i = buildings.length - 1; i >= 0; i--) {
            if (hitTestBuilding(buildings[i], x, y)) {
                selectBuilding(i); // New function
                selectPlot(-1);
                currentMode = 'BUILDING_DRAG';
                dragOffset = { x: x - buildings[i].x, y: y - buildings[i].y };
                return;
            }
        }

        for (let i = plots.length - 1; i >= 0; i--) {
            if (!plots[i].visible) continue;
            if (isPointInPoly(plots[i].points, { x, y })) {
                selectPlot(i);
                selectBuilding(-1);
                return;
            }
        }

        selectPlot(-1);
        selectBuilding(-1);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (camera.isPanning) {
        const dx = e.clientX - camera.startPan.x;
        const dy = e.clientY - camera.startPan.y;
        camera.offset.x += dx;
        camera.offset.y += dy;
        camera.startPan = { x: e.clientX, y: e.clientY };
        draw();
        return;
    }

    const { x, y } = getMousePos(e);
    mouse = { x, y };
    const snap = getSnappedPos(x, y);

    if (currentMode === 'BUILDING_DRAG' && selectedBuildingIndex !== -1) {
        buildings[selectedBuildingIndex].x = snap.x - dragOffset.x;
        buildings[selectedBuildingIndex].y = snap.y - dragOffset.y;
    }
    else if (currentMode === 'PLOT_EDIT_VERTEX' && selectedPlotIndex !== -1) {
        plots[selectedPlotIndex].points[draggedVertexIndex].x = snap.x;
        plots[selectedPlotIndex].points[draggedVertexIndex].y = snap.y;
        recalcPlotArea(selectedPlotIndex);
    }

    updateCursor();
});

canvas.addEventListener('mouseup', () => {
    camera.isPanning = false;
    canvas.style.cursor = 'default';
    if (currentMode === 'BUILDING_DRAG') currentMode = 'NONE';
    if (currentMode === 'PLOT_EDIT_VERTEX') {
        currentMode = 'NONE';
        draggedVertexIndex = -1;
    }
});

// --- HELPERS (Same as before) ---
function getSnappedPos(x, y) {
    if (!keysPressed['Shift']) {
        const threshold = 15 / camera.zoom;
        for (let plot of plots) {
            if (!plot.visible) continue;
            for (let p of plot.points) {
                if (Math.hypot(p.x - x, p.y - y) < threshold) return { x: p.x, y: p.y };
            }
        }
        if (currentMode === 'PLOT_DRAW' && currentPlotPoints.length > 0) {
            const last = currentPlotPoints[currentPlotPoints.length - 1];
            if (Math.abs(x - last.x) < threshold) return { x: last.x, y: y };
            if (Math.abs(y - last.y) < threshold) return { x: x, y: last.y };
        }
    }
    return { x, y };
}

function checkCollision(b) {
    if (b.type === 'driveway') return false; // Driveways don't check setbacks

    const center = { x: b.x + (b.w_m * scalePxPerM) / 2, y: b.y + (b.l_m * scalePxPerM) / 2 };
    let containerPlot = null;
    for (let p of plots) {
        if (p.visible && isPointInPoly(p.points, center)) { containerPlot = p; break; }
    }
    if (!containerPlot) return true;

    const minM = containerPlot.setbackSide || 4;
    if (minM <= 0) return false;

    let inset = computeInsetPolygon(containerPlot.points, minM * scalePxPerM);
    // Direction fix
    let cx = 0, cy = 0;
    containerPlot.points.forEach(p => { cx += p.x; cy += p.y });
    cx /= containerPlot.points.length; cy /= containerPlot.points.length;
    const dOriginal = Math.hypot(containerPlot.points[0].x - cx, containerPlot.points[0].y - cy);
    const dInset = (inset.length > 0) ? Math.hypot(inset[0].x - cx, inset[0].y - cy) : 0;
    if (dInset > dOriginal) inset = computeInsetPolygon(containerPlot.points, -minM * scalePxPerM);

    const w = b.w_m * scalePxPerM;
    const l = b.l_m * scalePxPerM;
    const corners = [{ x: -w / 2, y: -l / 2 }, { x: w / 2, y: -l / 2 }, { x: w / 2, y: l / 2 }, { x: -w / 2, y: l / 2 }];
    const rad = b.angle * Math.PI / 180;
    const transformed = corners.map(p => {
        return {
            x: center.x + (p.x * Math.cos(rad) - p.y * Math.sin(rad)),
            y: center.y + (p.x * Math.sin(rad) + p.y * Math.cos(rad))
        };
    });
    for (let p of transformed) { if (!isPointInPoly(inset, p)) return true; }
    return false;
}

function screenToWorld(sx, sy) {
    return { x: (sx - camera.offset.x) / camera.zoom, y: (sy - camera.offset.y) / camera.zoom };
}
function worldToScreen(wx, wy) {
    return { x: wx * camera.zoom + camera.offset.x, y: wy * camera.zoom + camera.offset.y };
}
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const sx = evt.clientX - rect.left;
    const sy = evt.clientY - rect.top;
    return screenToWorld(sx, sy);
}
// Compute signed area to determine polygon winding direction
function getPolygonSignedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
}

function computeInsetPolygon(points, offset) {
    if (!points || points.length < 3) return [];

    // Determine winding direction and adjust offset accordingly
    const signedArea = getPolygonSignedArea(points);
    // If clockwise (negative area), invert offset to get inward direction
    const adjustedOffset = signedArea < 0 ? -offset : offset;

    let lines = [];
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.0001) continue; // Skip degenerate edges
        dx /= len;
        dy /= len;
        // Normal pointing inward (perpendicular to edge)
        lines.push({
            p: { x: p1.x - dy * adjustedOffset, y: p1.y + dx * adjustedOffset },
            dir: { x: dx, y: dy }
        });
    }

    let insetPoints = [];
    for (let i = 0; i < lines.length; i++) {
        const l1 = lines[i];
        const l2 = lines[(i + 1) % lines.length];
        const det = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
        if (Math.abs(det) < 1e-9) continue; // Parallel lines
        const dx = l2.p.x - l1.p.x;
        const dy = l2.p.y - l1.p.y;
        const t = (dx * l2.dir.y - dy * l2.dir.x) / det;
        insetPoints.push({ x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t });
    }
    return insetPoints;
}
function selectPlot(index) {
    selectedPlotIndex = index;
    if (selectedPlotIndex !== -1) {
        const p = plots[selectedPlotIndex];
        plotNameInput.value = p.name;
        plotNameInput.disabled = false;

        setbackFrontInput.value = p.setbackFront || 6;
        setbackSideInput.value = p.setbackSide || 4;
        maxFrontageInput.value = p.maxFrontage || 16;

        recalcPlotArea(index);
    } else {
        plotNameInput.value = "";
        plotNameInput.disabled = true;
        areaDisplay.innerText = '-';
    }
    updateBalance();

    // Disable checkbox for now as list is hidden
    // document.getElementById('chkShowPlot').checked = ...
}

function selectBuilding(index) {
    selectedBuildingIndex = index;
    if (index !== -1) {
        const b = buildings[index];
        bWidthInput.value = b.w_m;
        bLengthInput.value = b.l_m;
        bTypeInput.value = b.type;
        bFloorsInput.value = b.floors || 1;
        bRoofInput.value = b.roofAngle || 30;
        bHeightInput.value = b.height || 0;

        // Show/Hide House Params
        document.getElementById('houseParams').style.display = (b.type === 'house') ? 'block' : 'none';
    }
    updateBalance();
}

function recalcPlotArea(index) {
    if (index < 0 || index >= plots.length) return;
    const pts = plots[index].points;
    let areaPx = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        areaPx += pts[i].x * pts[j].y;
        areaPx -= pts[j].x * pts[i].y;
    }
    plots[index].area = Math.abs(areaPx / 2) / (scalePxPerM * scalePxPerM);
    // updateUI called in updateBalance
}
function renderPlotList() {
    // plotListDiv.innerHTML = ''; 
    // Simplified: No list rendering in this version as requested by UI redesign
}
function updateUI() {
    scaleDisplay.innerText = `Skala: ${scalePxPerM ? scalePxPerM.toFixed(2) + ' px/m' : 'Nieustalona'}`;
    if (selectedPlotIndex !== -1 && scalePxPerM) {
        areaDisplay.innerText = plots[selectedPlotIndex].area.toFixed(2);
    }
    // renderPlotList();
}
function updateCursor() {
    if (camera.isPanning) return;
    canvas.className = '';
    if (currentMode === 'CALIBRATE' || currentMode === 'PLOT_DRAW') { canvas.classList.add('cursor-crosshair'); return; }
    if (selectedPlotIndex !== -1 && plots[selectedPlotIndex].visible) {
        for (let p of plots[selectedPlotIndex].points) {
            if (Math.hypot(worldToScreen(p.x, p.y).x - mouse.x, worldToScreen(p.x, p.y).y - mouse.y) < 10) { canvas.classList.add('cursor-move'); return; }
        }
    }
    for (let i = buildings.length - 1; i >= 0; i--) { if (hitTestBuilding(buildings[i], mouse.x, mouse.y)) { canvas.classList.add('cursor-grab'); if (currentMode === 'BUILDING_DRAG') canvas.classList.add('cursor-grabbing'); return; } }
    let hoveredPlot = false;
    for (let i = plots.length - 1; i >= 0; i--) { if (plots[i].visible && isPointInPoly(plots[i].points, mouse)) { hoveredPlot = true; break; } }
    if (hoveredPlot) { canvas.classList.add('cursor-pointer'); return; }
    canvas.classList.add('cursor-default');
}
function isPointInPoly(poly, pt) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (((poly[i].y > pt.y) != (poly[j].y > pt.y)) && (pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) c = !c;
    }
    return c;
}
function hitTestBuilding(b, mx, my) {
    const w_px = b.w_m * scalePxPerM;
    const l_px = b.l_m * scalePxPerM;
    return Math.hypot(mx - (b.x + w_px / 2), my - (b.y + l_px / 2)) < Math.max(w_px, l_px) / 2;
}

// Compute polygon area in square meters
function computePolygonAreaM2(points, pxPerM) {
    if (!points || points.length < 3 || !pxPerM || pxPerM <= 0) return 0;
    let areaPx = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        areaPx += points[i].x * points[j].y;
        areaPx -= points[j].x * points[i].y;
    }
    return Math.abs(areaPx / 2) / (pxPerM * pxPerM);
}

// Draw Loop
function loop() {
    if (selectedBuildingIndex !== -1) {
        if (keysPressed['ArrowLeft'] || keysPressed['a']) buildings[selectedBuildingIndex].angle -= 2;
        if (keysPressed['ArrowRight'] || keysPressed['d']) buildings[selectedBuildingIndex].angle += 2;
    }
    draw();
    requestAnimationFrame(loop);
}

// ... DRAW function is same as previous Step (Collision, Inset, etc.) ...
// For brevity I'll make sure it's included in the file write logic implicitly or explicitly.
// Since I'm overwriting the file, I MUST include draw().
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(camera.offset.x, camera.offset.y);
    ctx.scale(camera.zoom, camera.zoom);
    // Only draw image if it's fully loaded and valid
    if (img.src && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0);
    }
    if (calibrationPoints.length > 0) drawPointsLine(calibrationPoints, 'red', true);
    plots.forEach((poly, idx) => {
        if (!poly.visible) return;
        const isSelected = (idx === selectedPlotIndex);
        const pts = poly.points;
        if (pts.length === 0) return;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
        ctx.fillStyle = isSelected ? 'rgba(0, 0, 255, 0.3)' : poly.color; ctx.fill();
        ctx.strokeStyle = isSelected ? 'blue' : 'green'; ctx.lineWidth = 2 / camera.zoom; ctx.stroke();

        if (scalePxPerM > 0) {
            const minM = poly.setbackSide || 4;
            if (minM > 0) {
                // Use the improved computeInsetPolygon which handles winding direction
                const inset = computeInsetPolygon(pts, minM * scalePxPerM);
                if (inset.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(inset[0].x, inset[0].y);
                    for (let i = 1; i < inset.length; i++) ctx.lineTo(inset[i].x, inset[i].y);
                    ctx.closePath();
                    ctx.setLineDash([5 / camera.zoom, 5 / camera.zoom]);
                    ctx.strokeStyle = 'yellow';
                    ctx.lineWidth = 2 / camera.zoom;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }
        if (isSelected) {
            ctx.fillStyle = 'white'; ctx.strokeStyle = 'blue'; const radius = 5 / camera.zoom;
            for (let p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }

            // Draw plot info label
            let cx = 0, cy = 0;
            pts.forEach(p => { cx += p.x; cy += p.y });
            cx /= pts.length;
            cy /= pts.length;

            const fontSize = 14 / camera.zoom;
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Background for text
            const infoText = [
                poly.name,
                `${poly.area?.toFixed(0) || '?'} m²`,
                `Front: ${poly.setbackFront || 6}m | Boki: ${poly.setbackSide || 4}m`,
                `Max szer.: ${poly.maxFrontage || 16}m`
            ];

            const lineHeight = fontSize * 1.3;
            const totalHeight = infoText.length * lineHeight;
            const maxWidth = Math.max(...infoText.map(t => ctx.measureText(t).width)) + 10;

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(cx - maxWidth / 2, cy - totalHeight / 2, maxWidth, totalHeight);

            ctx.fillStyle = 'white';
            infoText.forEach((line, i) => {
                ctx.fillText(line, cx, cy - totalHeight / 2 + lineHeight / 2 + i * lineHeight);
            });

            // Draw edge dimensions (length in meters) as bubbles
            if (scalePxPerM > 0) {
                const fontSize = 10 / camera.zoom;
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                for (let i = 0; i < pts.length; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % pts.length];
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    const distM = (distPx / scalePxPerM).toFixed(1);

                    // Calculate perpendicular offset (outside the polygon)
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const len = Math.hypot(dx, dy);
                    const nx = -dy / len;  // Normal vector
                    const ny = dx / len;
                    const offset = 15 / camera.zoom;

                    const bubbleX = midX + nx * offset;
                    const bubbleY = midY + ny * offset;

                    const labelText = `${distM}m`;
                    const labelWidth = ctx.measureText(labelText).width + 8;
                    const labelHeight = fontSize + 6;
                    const radius = labelHeight / 2;

                    // Draw rounded bubble
                    ctx.fillStyle = 'rgba(0, 80, 0, 0.9)';
                    ctx.beginPath();
                    ctx.roundRect(bubbleX - labelWidth / 2, bubbleY - labelHeight / 2, labelWidth, labelHeight, radius);
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1 / camera.zoom;
                    ctx.stroke();

                    // Draw connector line from bubble to edge
                    ctx.strokeStyle = 'rgba(0, 80, 0, 0.7)';
                    ctx.lineWidth = 1 / camera.zoom;
                    ctx.beginPath();
                    ctx.moveTo(midX, midY);
                    ctx.lineTo(bubbleX, bubbleY);
                    ctx.stroke();

                    // Draw text
                    ctx.fillStyle = 'white';
                    ctx.fillText(labelText, bubbleX, bubbleY);
                }
            }
        }
    });

    // Draw current plot points being drawn (ALWAYS render these prominently)
    if (currentPlotPoints.length > 0) {
        drawPointsLine(currentPlotPoints, 'orange', false);
        // Also draw individual points more visibly
        ctx.fillStyle = 'orange';
        ctx.strokeStyle = 'darkorange';
        ctx.lineWidth = 2 / camera.zoom;
        currentPlotPoints.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 / camera.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Number the points
            ctx.fillStyle = 'white';
            ctx.font = `bold ${10 / camera.zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), p.x, p.y);
            ctx.fillStyle = 'orange';
        });
    }

    // Buildings
    for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const isColliding = checkCollision(b);
        ctx.save();
        const w_px = b.w_m * scalePxPerM;
        const l_px = b.l_m * scalePxPerM;
        ctx.translate(b.x + w_px / 2, b.y + l_px / 2);
        ctx.rotate(b.angle * Math.PI / 180);

        ctx.fillStyle = isColliding ? 'rgba(255,0,0,0.6)' : b.color;
        ctx.fillRect(-w_px / 2, -l_px / 2, w_px, l_px);

        const isSelected = (i === selectedBuildingIndex);
        let strokeColor = isSelected ? 'blue' : 'black';
        if (isColliding) strokeColor = 'red';

        // Frontage Validation (Visual)
        // If type is house and width > 16m -> Red Stroke
        if (b.type === 'house' && b.w_m > 16) strokeColor = 'red';

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = (isSelected ? 3 : 1) / camera.zoom;
        ctx.strokeRect(-w_px / 2, -l_px / 2, w_px, l_px);

        ctx.fillStyle = 'black'; ctx.font = `${12 / camera.zoom}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        // Calculate area for label
        const areaM2 = (b.w_m * b.l_m).toFixed(1);

        let label = '';
        if (b.type === 'house') label = `DOM ${b.floors}k\n${areaM2}m²`;
        if (b.type === 'garage') label = `GARAŻ\n${areaM2}m²`;
        if (b.type === 'driveway') label = `P\n${areaM2}m²`;

        // Multiline text handling
        const lines = label.split('\n');
        lines.forEach((line, n) => {
            ctx.fillText(line, 0, (n - (lines.length - 1) / 2) * (14 / camera.zoom));
        });

        // --- DRAW SIDE DIMENSIONS ---
        ctx.font = `${10 / camera.zoom}px monospace`;
        ctx.fillStyle = '#333';

        // Width (Top Edge)
        ctx.fillText(b.w_m.toFixed(2) + 'm', 0, -l_px / 2 - (5 / camera.zoom));

        // Length (Right Edge)
        ctx.save();
        ctx.translate(w_px / 2 + (5 / camera.zoom), 0);
        ctx.rotate(Math.PI / 2); // Rotate text to match vertical edge
        ctx.fillText(b.l_m.toFixed(2) + 'm', 0, 0);
        ctx.restore();

        ctx.restore();
    }
    ctx.restore();

    // Draw crosshair in center when actively drawing plots or in calibration
    const isDrawingPlot = currentMode === 'PLOT_DRAW' || activeTool === 'DRAW';
    const isCalibrating = calibrationPoints.length < 2;
    const showCrosshair = isDrawingPlot || isCalibrating;

    if (showCrosshair) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Draw crosshair with better visibility
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 25, cy);
        ctx.lineTo(cx + 25, cy);
        ctx.moveTo(cx, cy - 25);
        ctx.lineTo(cx, cy + 25);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        // White outline for better visibility on dark backgrounds
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawPointsLine(pts, c, cl) { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let p of pts.slice(1)) ctx.lineTo(p.x, p.y); if (cl) ctx.closePath(); ctx.stroke(); ctx.fillStyle = c; for (let p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / camera.zoom, 0, Math.PI * 2); ctx.fill(); } }

// --- EVENT LISTENERS (UI) ---

window.addEventListener('resize', () => { if (canvas.parentElement) { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; draw(); } });

// Button-based Calibration (mobile-friendly)
const btnCalibPoint1 = document.getElementById('btnCalibPoint1');
const btnCalibPoint2 = document.getElementById('btnCalibPoint2');
const calibPointsCount = document.getElementById('calibPointsCount');

function getScreenCenterWorld() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    return {
        x: (centerX - camera.offset.x) / camera.zoom,
        y: (centerY - camera.offset.y) / camera.zoom
    };
}

btnCalibPoint1?.addEventListener('click', () => {
    calibrationPoints = [getScreenCenterWorld()];
    btnCalibPoint1.disabled = true;
    btnCalibPoint1.textContent = '✓ Punkt 1';
    btnCalibPoint2.disabled = false;
    calibPointsCount.textContent = '1';
    showToast('Punkt 1 zapisany. Teraz ustaw celownik na punkcie 2.', 'success');
    draw();
});

btnCalibPoint2?.addEventListener('click', () => {
    calibrationPoints.push(getScreenCenterWorld());
    btnCalibPoint2.disabled = true;
    btnCalibPoint2.textContent = '✓ Punkt 2';
    calibPointsCount.textContent = '2';
    calibrationInputDiv.style.display = 'block';
    showToast('Oba punkty zapisane. Wpisz odległość.', 'success');
    draw();
});

// Reset calibration buttons when scale is confirmed
document.getElementById('btnConfirmScale')?.addEventListener('click', () => {
    // Calculate scale
    const realM = parseFloat(document.getElementById('realDistance').value);
    if (realM > 0 && calibrationPoints.length === 2) {
        const d = Math.hypot(
            calibrationPoints[1].x - calibrationPoints[0].x,
            calibrationPoints[1].y - calibrationPoints[0].y
        );

        if (d < 1) {
            showToast('Błąd: Punkty są za blisko siebie! Przesuń mapę.', 'error');
            return;
        }

        scalePxPerM = d / realM;
        showToast(`Skala: ${scalePxPerM.toFixed(2)} px/m`, 'success');
        updateUI();
        calibrationInputDiv.style.display = 'none';
        currentMode = 'NONE';
        draw();
    }

    // Reset buttons for next calibration
    if (btnCalibPoint1) {
        btnCalibPoint1.disabled = false;
        btnCalibPoint1.textContent = '📍 Punkt 1';
    }
    if (btnCalibPoint2) {
        btnCalibPoint2.disabled = true;
        btnCalibPoint2.textContent = '📍 Punkt 2';
    }
    if (calibPointsCount) calibPointsCount.textContent = '0';
});
document.getElementById('btnDrawPlot').onclick = document.getElementById('toolDraw').onclick;

// Button-based Plot Drawing (mobile-friendly)
const btnAddPlotPoint = document.getElementById('btnAddPlotPoint');
const btnFinishPlot = document.getElementById('btnFinishPlot');

btnAddPlotPoint?.addEventListener('click', () => {
    debounceButton('btnAddPlotPoint', () => {
        if (currentMode !== 'PLOT_DRAW') {
            currentMode = 'PLOT_DRAW';
            currentPlotPoints = [];
            logAction('PLOT', 'Started drawing new plot via button');
        }
        const point = getScreenCenterWorld();
        currentPlotPoints.push(point);
        syncFinishPlotButton();
        logAction('PLOT', 'Point added via button', {
            pointIndex: currentPlotPoints.length,
            x: point.x.toFixed(0),
            y: point.y.toFixed(0)
        });
        showToast(`Punkt ${currentPlotPoints.length} dodany`, 'success', 1000);
        draw();
    });
});

btnFinishPlot?.addEventListener('click', () => {
    debounceButton('btnFinishPlot', () => {
        logAction('PLOT', 'Finish button clicked', { pointsCount: currentPlotPoints.length });

        if (currentPlotPoints.length < 3) {
            logAction('PLOT', 'Cannot finish - not enough points', { pointsCount: currentPlotPoints.length });
            showToast('Potrzeba min. 3 punktów!', 'error');
            return;
        }

        const name = plotNameInput?.value || 'Działka ' + nextPlotId;
        const area = computePolygonAreaM2(currentPlotPoints, scalePxPerM);

        const newPlot = {
            id: nextPlotId++,
            name: name,
            points: [...currentPlotPoints],
            area: area,
            color: 'rgba(0, 128, 0, 0.3)',
            setbackFront: parseFloat(setbackFrontInput?.value) || 6,
            setbackSide: parseFloat(setbackSideInput?.value) || 4,
            maxFrontage: parseFloat(maxFrontageInput?.value) || 16,
            visible: true
        };

        plots.push(newPlot);
        markAsUnsaved();
        logAction('PLOT', 'Plot created successfully', {
            id: newPlot.id,
            name: newPlot.name,
            area: area.toFixed(2),
            pointsCount: newPlot.points.length
        });

        currentPlotPoints = [];
        currentMode = 'NONE';
        syncFinishPlotButton();
        setTool('SELECT');
        showToast('Działka utworzona!', 'success');
        draw();
    });
});

document.getElementById('btnClearPlot').addEventListener('click', () => {
    debounceButton('btnClearPlot', () => {
        logAction('PLOT', 'Delete button clicked', { selectedPlotIndex });
        if (selectedPlotIndex !== -1) {
            if (confirm('Usunąć działkę?')) {
                const deletedPlot = plots[selectedPlotIndex];
                logAction('PLOT', 'Plot deleted', { id: deletedPlot.id, name: deletedPlot.name });
                plots.splice(selectedPlotIndex, 1);
                markAsUnsaved();
                selectPlot(-1);
                draw();
            }
        } else {
            logAction('PLOT', 'No plot selected for deletion');
            showToast('Najpierw zaznacz działkę', 'warning');
        }
    });
});

// Building Add Trigger
document.getElementById('btnAddBuilding').addEventListener('click', addBuildingFromInputs);

// Input Changes (Live Update)
bTypeInput.addEventListener('change', () => {
    const isHouse = (bTypeInput.value === 'house');
    document.getElementById('houseParams').style.display = isHouse ? 'block' : 'none';
});

// Update Selected Object on Input Change
[setbackFrontInput, setbackSideInput, maxFrontageInput].forEach(el => {
    el.addEventListener('change', () => {
        if (selectedPlotIndex !== -1) {
            plots[selectedPlotIndex].setbackFront = parseFloat(setbackFrontInput.value);
            plots[selectedPlotIndex].setbackSide = parseFloat(setbackSideInput.value);
            plots[selectedPlotIndex].maxFrontage = parseFloat(maxFrontageInput.value);
            updateBalance();
            draw();
        }
    });
});

[bWidthInput, bLengthInput, bFloorsInput, bRoofInput, bHeightInput, bTypeInput].forEach(el => {
    el.addEventListener('change', () => {
        if (selectedBuildingIndex !== -1) {
            const b = buildings[selectedBuildingIndex];
            b.w_m = parseFloat(bWidthInput.value);
            b.l_m = parseFloat(bLengthInput.value);
            b.type = bTypeInput.value;
            b.floors = parseFloat(bFloorsInput.value);
            b.roofAngle = parseFloat(bRoofInput.value);
            b.height = parseFloat(bHeightInput.value);

            // Update color based on type
            b.color = b.type === 'driveway' ? 'rgba(100, 100, 100, 0.7)'
                : (b.type === 'garage' ? 'rgba(150, 100, 50, 0.7)'
                    : 'rgba(255, 0, 0, 0.5)');

            logAction('BUILDING', 'Building updated', { type: b.type, width: b.w_m, length: b.l_m });
            updateBalance();
            draw();
        }
    });
});

document.getElementById('btnSave').addEventListener('click', () => { const link = document.createElement('a'); link.download = 'plan.png'; link.href = canvas.toDataURL(); link.click(); });
// NOTE: btnConfirmScale listener is already defined in lines 1024-1056, removed duplicate here
plotNameInput.addEventListener('input', (e) => { if (selectedPlotIndex !== -1) { plots[selectedPlotIndex].name = e.target.value; renderPlotList(); } }); // Simplified, list removed for now

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return; // Don't delete when typing
    keysPressed[e.key] = true;
    if (e.key === 'Delete') {
        if (selectedBuildingIndex !== -1) { buildings.splice(selectedBuildingIndex, 1); selectedBuildingIndex = -1; markAsUnsaved(); }
        else if (selectedPlotIndex !== -1 && confirm('Usunąć?')) { plots.splice(selectedPlotIndex, 1); selectPlot(-1); markAsUnsaved(); }
        draw();
        updateBalance();
    }
    if (e.key === ' ') { canvas.style.cursor = 'grab'; }
    if (e.key.toLowerCase() === 'v') setTool('SELECT');
    if (e.key.toLowerCase() === 'h') setTool('PAN');
    if (e.key.toLowerCase() === 'p') setTool('DRAW');
});
window.addEventListener('keyup', (e) => { keysPressed[e.key] = false; if (e.key === ' ') canvas.style.cursor = 'default'; });


// --- LOGIC: ADD BUILDING ---
function addBuildingFromInputs() {
    logAction('BUILDING', 'Add building button clicked');

    if (!scalePxPerM) {
        logAction('BUILDING', 'Cannot add building - no scale set');
        showToast('Najpierw ustaw skal\u0119!', 'error');
        return;
    }

    const type = bTypeInput.value;
    const w_m = parseFloat(bWidthInput.value);
    const l_m = parseFloat(bLengthInput.value);
    const floors = parseFloat(bFloorsInput.value) || 1;
    const roofAngle = parseFloat(bRoofInput.value) || 30;
    const height = parseFloat(bHeightInput.value) || 0;

    // Validation with logging
    let warnings = [];
    if (type === 'house' && w_m > 16) {
        warnings.push('Szeroko\u015b\u0107 domu > 16m przekracza MPZP!');
    }
    if (type === 'garage' && w_m > 8) {
        warnings.push('Szeroko\u015b\u0107 gara\u017cu > 8m przekracza MPZP!');
    }
    if (w_m <= 0 || l_m <= 0) {
        logAction('BUILDING', 'Invalid dimensions', { w_m, l_m });
        showToast('Nieprawid\u0142owe wymiary!', 'error');
        return;
    }

    warnings.forEach(w => {
        logAction('BUILDING', 'Warning: ' + w);
        showToast(w, 'warning', 4000);
    });

    const centerScreen = { x: canvas.width / 2, y: canvas.height / 2 };
    const centerWorld = screenToWorld(centerScreen.x, centerScreen.y);

    const newBuilding = {
        x: centerWorld.x - (w_m * scalePxPerM) / 2,
        y: centerWorld.y - (l_m * scalePxPerM) / 2,
        w_m: w_m,
        l_m: l_m,
        type: type,
        floors: floors,
        roofAngle: roofAngle,
        height: height,
        angle: 0,
        color: type === 'driveway' ? 'rgba(100, 100, 100, 0.7)' : (type === 'garage' ? 'rgba(150, 100, 50, 0.7)' : 'rgba(255, 0, 0, 0.5)')
    };

    buildings.push(newBuilding);
    markAsUnsaved();

    logAction('BUILDING', 'Building created', {
        type: type,
        width: w_m,
        length: l_m,
        floors: floors,
        area: (w_m * l_m).toFixed(2),
        index: buildings.length - 1
    });

    showToast(`Budynek dodany: ${type} ${w_m}x${l_m}m`, 'success');
    updateBalance();
    draw();
}

// --- LOGIC: UPDATE BALANCE & VALIDATION ---
function updateBalance() {
    updateUI(); // Keep text displays updated

    if (selectedPlotIndex === -1) {
        valFAR.innerText = '-'; valGreen.innerText = '-'; valParking.innerText = '-';
        statusFAR.innerText = ''; statusGreen.innerText = ''; statusParking.innerText = '';
        return;
    }

    const plot = plots[selectedPlotIndex];
    if (plot.area <= 0) return;

    // Find objects ON this plot
    let buildArea = 0;
    let pavedArea = 0;
    let totalFloorArea = 0;
    let parkingSpots = 0; // Naive: 1 spot per driveway? Or assume driveway area? 
    // Let's assume Type='driveway' is "Utwardzenie" and 
    // Type='driveway' && Area >= 12.5m2 (2.5x5) counts as parking?
    // Or user manually adds parking objects? 
    // Let's count number of 'driveway' objects for now as spots? 
    // The User Plan says "Min 2 places". 

    buildings.forEach(b => {
        // Check center point
        const cx = b.x + (b.w_m * scalePxPerM) / 2;
        const cy = b.y + (b.l_m * scalePxPerM) / 2;
        if (isPointInPoly(plot.points, { x: cx, y: cy })) {
            const area = b.w_m * b.l_m;
            if (b.type === 'driveway') {
                pavedArea += area;
                if (area >= 12) parkingSpots++;
            } else {
                buildArea += area;
                totalFloorArea += area * (b.floors || 1);
            }
        }
    });

    // 1. FAR (Intensywność)
    const far = totalFloorArea / plot.area;
    valFAR.innerText = far.toFixed(2);
    if (far >= 0.1 && far <= 0.5) statusFAR.innerHTML = '<span style="color:green">OK</span>';
    else statusFAR.innerHTML = '<span style="color:red">NIEZGODNE</span>';

    // 2. Green Area
    const greenArea = plot.area - (buildArea + pavedArea);
    const greenRatio = (greenArea / plot.area) * 100;
    valGreen.innerText = greenRatio.toFixed(1) + '%';
    if (greenRatio >= 50) statusGreen.innerHTML = '<span style="color:green">OK</span>';
    else statusGreen.innerHTML = '<span style="color:red">ZA MAŁO</span>';

    // 3. Parking
    valParking.innerText = parkingSpots;
    if (parkingSpots >= 2) statusParking.innerHTML = '<span style="color:green">OK</span>';
    else statusParking.innerHTML = '<span style="color:red">BRAK (min 2)</span>';
}


// Zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const { x: mouseWorldX, y: mouseWorldY } = getMousePos(e);

    if (e.deltaY < 0) {
        camera.zoom *= (1 + zoomIntensity);
    } else {
        camera.zoom /= (1 + zoomIntensity);
    }

    // Limit zoom
    camera.zoom = Math.max(0.1, Math.min(camera.zoom, 10));

    // Adjust offset to keep mouse world position stable
    const rect = canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    camera.offset.x = mouseScreenX - mouseWorldX * camera.zoom;
    camera.offset.y = mouseScreenY - mouseWorldY * camera.zoom;

    draw();
});

// --- INIT & RESIZE HANDLING ---

// Debounce utility
let resizeTimeout = null;
function debouncedResize(width, height) {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
            canvas.width = width;
            canvas.height = height;
            draw();
        }
    }, 50); // 50ms debounce
}

// Use ResizeObserver for robust layout handling  
const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
        if (entry.target === canvas.parentElement) {
            const width = Math.floor(entry.contentRect.width);
            const height = Math.floor(entry.contentRect.height);
            debouncedResize(width, height);
        }
    }
});

if (canvas.parentElement) {
    resizeObserver.observe(canvas.parentElement);
    canvas.width = canvas.parentElement.clientWidth || 800;
    canvas.height = canvas.parentElement.clientHeight || 600;
}
draw();

// Start the animation loop for continuous rendering
loop();

// Initialize auto-save system
checkForAutoSave();
startAutoSave();

// --- TOUCH SUPPORT FOR MOBILE ---
let touchStartDistance = 0;
let touchStartZoom = 1;
let touchStartOffset = { x: 0, y: 0 };
let lastTouchCenter = { x: 0, y: 0 };

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

function getTouchCenter(touches) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((touches[0].clientX + touches[1].clientX) / 2) - rect.left,
        y: ((touches[0].clientY + touches[1].clientY) / 2) - rect.top
    };
}

// Unified touch state
let touchStartTime = 0;
let touchStartPos = { x: 0, y: 0 };
let didMove = false;

canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        touchStartDistance = getTouchDistance(e.touches);
        touchStartZoom = camera.zoom;
        touchStartOffset = { ...camera.offset };
        lastTouchCenter = getTouchCenter(e.touches);
    } else if (e.touches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;

        lastTouchCenter = { x, y };
        touchStartTime = Date.now();
        touchStartPos = { x, y };
        didMove = false;

        // CALIBRATE and PLOT_DRAW modes ALWAYS disable panning - need tap for points
        const isPointMode = currentMode === 'CALIBRATE' || currentMode === 'PLOT_DRAW';
        camera.isPanning = !isPointMode && (activeTool === 'PAN' || activeTool === 'SELECT');
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scale = currentDistance / touchStartDistance;
        const newZoom = Math.max(0.1, Math.min(10, touchStartZoom * scale));

        const center = getTouchCenter(e.touches);
        const worldX = (center.x - camera.offset.x) / camera.zoom;
        const worldY = (center.y - camera.offset.y) / camera.zoom;

        camera.zoom = newZoom;
        camera.offset.x = center.x - worldX * camera.zoom;
        camera.offset.y = center.y - worldY * camera.zoom;

        draw();
    } else if (e.touches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;

        if (camera.isPanning) {
            // Only count as "move" if we're actually panning
            const moveDistance = Math.hypot(x - touchStartPos.x, y - touchStartPos.y);
            if (moveDistance > 10) {
                didMove = true;
            }

            e.preventDefault();
            camera.offset.x += x - lastTouchCenter.x;
            camera.offset.y += y - lastTouchCenter.y;
            lastTouchCenter = { x, y };
            draw();
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        touchStartDistance = 0;
    }

    // Handle tap (single finger, quick, no movement)
    if (e.changedTouches.length === 1 && e.touches.length === 0) {
        const tapDuration = Date.now() - touchStartTime;
        const rect = canvas.getBoundingClientRect();
        const endX = e.changedTouches[0].clientX - rect.left;
        const endY = e.changedTouches[0].clientY - rect.top;
        const distance = Math.hypot(endX - touchStartPos.x, endY - touchStartPos.y);

        // DEBUG
        console.log('TAP CHECK:', {
            duration: tapDuration,
            distance: distance,
            didMove: didMove,
            mode: currentMode,
            tool: activeTool,
            calibPoints: calibrationPoints.length
        });

        // Tap: < 500ms, < 30px movement, no significant move during touch
        if (tapDuration < 500 && distance < 30 && !didMove) {
            const worldX = (endX - camera.offset.x) / camera.zoom;
            const worldY = (endY - camera.offset.y) / camera.zoom;
            const snap = getSnappedPos(worldX, worldY);

            console.log('TAP ACCEPTED, mode:', currentMode);

            // CALIBRATE mode takes absolute priority
            if (currentMode === 'CALIBRATE') {
                calibrationPoints.push(snap);
                console.log('CALIBRATION POINT ADDED:', calibrationPoints.length);
                showToast(`Punkt kalibracji ${calibrationPoints.length}/2`, 'success', 1500);
                if (calibrationPoints.length === 2) {
                    calibrationInputDiv.style.display = 'block';
                    currentMode = 'NONE';
                    setTool('SELECT');
                    showToast('Podaj odległość w metrach', 'info');
                }
                draw();
            }
            // Then handle DRAW tool
            else if (activeTool === 'DRAW') {
                if (currentMode !== 'PLOT_DRAW') {
                    currentMode = 'PLOT_DRAW';
                    currentPlotPoints = [];
                }
                currentPlotPoints.push(snap);
                showToast(`Punkt ${currentPlotPoints.length} dodany`, 'info', 1000);
                draw();
            }
        } else {
            console.log('TAP REJECTED:', tapDuration >= 500 ? 'too slow' : distance >= 30 ? 'moved too much' : 'didMove');
        }
    }

    camera.isPanning = false;
});

// --- FULLSCREEN MODE ---
const fullscreenBtn = document.getElementById('toolFullscreen');
let isFullscreen = false;

function toggleFullscreen() {
    const mainContent = document.querySelector('.main-content');
    const sidebar = document.querySelector('.sidebar');
    const toolbar = document.querySelector('.toolbar');

    isFullscreen = !isFullscreen;

    if (isFullscreen) {
        sidebar.style.display = 'none';
        toolbar.style.display = 'none';
        mainContent.style.position = 'fixed';
        mainContent.style.top = '0';
        mainContent.style.left = '0';
        mainContent.style.width = '100vw';
        mainContent.style.height = '100vh';
        mainContent.style.zIndex = '1000';
        showToast('Pełny ekran - Kliknij 2x aby wyjść', 'info');
    } else {
        sidebar.style.display = '';
        toolbar.style.display = '';
        mainContent.style.position = '';
        mainContent.style.top = '';
        mainContent.style.left = '';
        mainContent.style.width = '';
        mainContent.style.height = '';
        mainContent.style.zIndex = '';
    }

    // Trigger resize
    setTimeout(() => {
        if (canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
            draw();
        }
    }, 100);
}

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
}

// Double-tap to exit fullscreen
canvas.addEventListener('dblclick', () => {
    if (isFullscreen) toggleFullscreen();
});

// 'F' key for fullscreen
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f' && document.activeElement.tagName !== 'INPUT') {
        toggleFullscreen();
    }
});
