import pytest
import os
import tempfile
from server import app, init_db

@pytest.fixture
def client():
    """Create test client with temporary database."""
    db_fd, db_path = tempfile.mkstemp()
    app.config['TESTING'] = True
    
    # Patch the DB_PATH in server module
    import server
    original_db_path = server.DB_PATH
    server.DB_PATH = db_path
    
    # Initialize the temp db
    server.init_db()
    
    with app.test_client() as client:
        yield client
    
    # Restore original path and clean up
    server.DB_PATH = original_db_path
    os.close(db_fd)
    os.unlink(db_path)

def test_index(client):
    """Test main page loads."""
    rv = client.get('/')
    assert rv.status_code == 200
    assert b'Planer' in rv.data

def test_get_images_empty(client):
    """Test images API returns list."""
    rv = client.get('/api/images')
    assert rv.status_code == 200
    assert rv.content_type == 'application/json'
    assert rv.json == []

def test_get_projects(client):
    """Test projects API returns list."""
    rv = client.get('/api/projects')
    assert rv.status_code == 200
    assert rv.content_type == 'application/json'
    assert rv.json == []

def test_static_files(client):
    """Test static files are served."""
    rv = client.get('/style.css')
    assert rv.status_code == 200
    
    rv = client.get('/app.js')
    assert rv.status_code == 200

def test_upload_no_file(client):
    """Test upload fails without file."""
    rv = client.post('/api/upload')
    assert rv.status_code == 400

def test_project_lifecycle(client):
    """Test full project lifecycle: upload -> list -> download -> delete."""
    # 1. Upload
    import io
    import json
    
    project_data = {
        "version": 2,
        "plots": [{"id": 1, "area": 500}],
        "buildings": []
    }
    
    data = {
        'file': (io.BytesIO(json.dumps(project_data).encode('utf-8')), 'test_project.json'),
        'description': 'Test Project'
    }
    
    rv = client.post('/api/project/upload', data=data, content_type='multipart/form-data')
    assert rv.status_code == 200
    assert rv.json['success'] is True
    
    # 2. List
    rv = client.get('/api/projects')
    assert rv.status_code == 200
    projects = rv.json
    assert len(projects) == 1
    assert projects[0]['original_name'] == 'test_project.json'
    filename = projects[0]['filename']
    proj_id = projects[0]['id']
    
    # 3. Download
    rv = client.get(f'/projects/{filename}')
    assert rv.status_code == 200
    downloaded_data = json.loads(rv.data)
    assert downloaded_data['version'] == 2
    assert downloaded_data['plots'][0]['area'] == 500
    
    # 4. Delete
    rv = client.post(f'/api/project/{proj_id}/delete')
    assert rv.status_code == 200
    assert rv.json['success'] is True
    
    # Verify deletion
    rv = client.get('/api/projects')
    assert len(rv.json) == 0

def test_image_lifecycle(client):
    """Test image lifecycle: upload -> list -> delete."""
    import io
    
    # 1. Upload
    data = {
        'file': (io.BytesIO(b'fake png header'), 'map.png'),
        'description': 'Map test'
    }
    rv = client.post('/api/upload', data=data, content_type='multipart/form-data')
    assert rv.status_code == 201
    
    # 2. List
    rv = client.get('/api/images')
    images = rv.json
    assert len(images) == 1
    img_id = images[0]['id']
    
    # 3. Delete
    rv = client.post(f'/api/image/{img_id}/delete')
    assert rv.status_code == 200
    
    # Verify
    rv = client.get('/api/images')
    assert len(rv.json) == 0
