import pytest
import os
import tempfile
from server import app, init_db

@pytest.fixture
def client():
    """Create test client with temporary database."""
    db_fd, db_path = tempfile.mkstemp()
    app.config['TESTING'] = True
    
    with app.test_client() as client:
        yield client
    
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

def test_get_projects(client):
    """Test projects API returns list."""
    rv = client.get('/api/projects')
    assert rv.status_code == 200
    assert rv.content_type == 'application/json'

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

def test_upload_image(client):
    """Test image upload."""
    import io
    data = {
        'file': (io.BytesIO(b'fake image content'), 'test.png'),
        'description': 'Test image'
    }
    rv = client.post('/api/upload', data=data, content_type='multipart/form-data')
    assert rv.status_code == 201
