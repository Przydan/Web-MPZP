
import os
import sqlite3
import datetime
import logging
from flask import Flask, request, jsonify, send_from_directory

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.')
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max upload size
DB_PATH = 'planer.db'
UPLOAD_FOLDER = 'uploads'

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Allowed file extensions for uploads
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS images
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  filename TEXT NOT NULL, 
                  original_name TEXT, 
                  description TEXT, 
                  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS projects
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  filename TEXT NOT NULL, 
                  original_name TEXT, 
                  description TEXT, 
                  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
                  
    conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

from contextlib import contextmanager

@contextmanager
def db_session():
    """Context manager for database sessions with auto-commit and close."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        conn.close()

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)
    
@app.route('/projects/<filename>')
def serve_project_file(filename):
    if not os.path.exists('projects'): os.makedirs('projects')
    return send_from_directory('projects', filename)

@app.route('/api/images', methods=['GET'])
def get_images():
    logger.info('Fetching all images')
    with db_session() as conn:
        images = conn.execute('SELECT * FROM images ORDER BY upload_date DESC').fetchall()
        return jsonify([dict(ix) for ix in images])

@app.route('/api/projects', methods=['GET'])
def get_projects():
    logger.info('Fetching all projects')
    with db_session() as conn:
        projs = conn.execute('SELECT * FROM projects ORDER BY upload_date DESC').fetchall()
        return jsonify([dict(ix) for ix in projs])

@app.route('/api/project/upload', methods=['POST'])
def upload_project():
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    desc = request.form.get('description', '')
    
    if not os.path.exists('projects'): os.makedirs('projects')
    
    filename = f"proj_{int(datetime.datetime.now().timestamp())}.json"
    filepath = os.path.join('projects', filename)
    file.save(filepath)
    
    conn = get_db_connection()
    conn.execute('INSERT INTO projects (filename, original_name, description) VALUES (?, ?, ?)',
                 (filename, file.filename or 'projekt.json', desc))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/project/<int:id>/delete', methods=['POST'])
def delete_project(id):
    conn = get_db_connection()
    p = conn.execute('SELECT filename FROM projects WHERE id = ?', (id,)).fetchone()
    if p:
        try:
            os.remove(os.path.join('projects', p['filename']))
        except OSError as e:
            logger.warning(f"Could not delete project file {p['filename']}: {e}")
        conn.execute('DELETE FROM projects WHERE id = ?', (id,))
        conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Allowed: {ALLOWED_EXTENSIONS}'}), 400
    
    if file:
        filename = f"{int(datetime.datetime.now().timestamp())}_{file.filename}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        desc = request.form.get('description', '')
        
        conn = get_db_connection()
        conn.execute('INSERT INTO images (filename, original_name, description) VALUES (?, ?, ?)',
                     (filename, file.filename, desc))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'filename': filename}), 201

@app.route('/api/image/<int:id>/update', methods=['POST'])
def update_image(id):
    data = request.json
    desc = data.get('description')
    if desc is None:
        return jsonify({'error': 'No description provided'}), 400
        
    conn = get_db_connection()
    conn.execute('UPDATE images SET description = ? WHERE id = ?', (desc, id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/image/<int:id>/delete', methods=['POST'])
def delete_image(id):
    conn = get_db_connection()
    img = conn.execute('SELECT filename FROM images WHERE id = ?', (id,)).fetchone()
    
    if img:
        try:
            os.remove(os.path.join(UPLOAD_FOLDER, img['filename']))
        except OSError as e:
            logger.warning(f"Could not delete image file {img['filename']}: {e}")
        conn.execute('DELETE FROM images WHERE id = ?', (id,))
        conn.commit()
        
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    print("Starting Flask Server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
