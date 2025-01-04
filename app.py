from flask import Flask, render_template, request, jsonify, session
import os
from dotenv import load_dotenv
from twelvelabs import TwelveLabs
import requests
import logging
import uuid
from werkzeug.utils import secure_filename

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key') 
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  

API_KEY = os.getenv('API_KEY')
BASE_URL = "https://api.twelvelabs.io/v1.3"

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])


client = TwelveLabs(api_key=API_KEY)

ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'wmv', 'mkv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def create_index():
    try:
        index_name = f"ContentAnalysis_{uuid.uuid4().hex[:8]}"
        engines = [
            {
                "name": "pegasus1.1",
                "options": ["visual", "conversation"]
            }
        ]
        
        index = client.index.create(
            name=index_name,
            engines=engines  
        )
        
        logger.info(f"Created new index with ID: {index.id}")
        return index.id
    except Exception as e:
        logger.error(f"Failed to create index: {str(e)}")
        raise

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_video():
    filepath = None  
    try:
        if 'video' not in request.files:
            return jsonify({'success': False, 'error': 'No video file provided'}), 400
        
        file = request.files['video']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Invalid file type'}), 400

        index_id = create_index()
        session['index_id'] = index_id

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        task = client.task.create(
            index_id=index_id,
            file=filepath
        )
        
        def on_task_update(task):
            logger.info(f"Indexing status: {task.status}")
        
        task.wait_for_done(sleep_interval=5, callback=on_task_update)
        
        if task.status != "ready":
            raise Exception(f"Indexing failed with status {task.status}")

        session['video_id'] = task.video_id
        
        return jsonify({
            'success': True,
            'message': 'Video uploaded and indexed successfully',
            'video_id': task.video_id
        })
        
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    
    finally:
  
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                logger.error(f"Failed to remove temporary file: {str(e)}")

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'video_id' not in session:
        return jsonify({'success': False, 'error': 'No video indexed'}), 400
    
    video_id = session['video_id']
    index_id = session['index_id']
    
    try:

        headers = {
            "x-api-key": API_KEY,
            "Content-Type": "application/json"
        }
        url_response = requests.get(
            f"{BASE_URL}/indexes/{index_id}/videos/{video_id}",
            headers=headers
        )
        url_response.raise_for_status()  
        video_url = url_response.json().get('hls', {}).get('video_url')
        
        if not video_url:
            raise Exception("Failed to get video URL")

        analysis_response = client.generate.text(
            video_id=video_id,
            prompt="Provide a detailed analysis of this video's content, identifying any concerning or inappropriate material."
        )
        
        analysis_text = str(analysis_response.data).strip()
        
        return jsonify({
            'success': True,
            'video_url': video_url,
            'analysis': analysis_text
        })
        
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)