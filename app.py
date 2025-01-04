from flask import Flask, render_template, request, jsonify, session
import os
from dotenv import load_dotenv
from twelvelabs import TwelveLabs
import requests
import logging
import uuid
from werkzeug.utils import secure_filename
import json
from datetime import datetime

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
    """Create a new index with appropriate engines"""
    try:
        index_name = f"ContentAnalysis_{uuid.uuid4().hex[:8]}"
        engines = [
            {
                "name": "pegasus1.1",
                "options": ["visual", "conversation"]
            }
        ]
        
        logger.debug(f"Creating new index with name: {index_name}")
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
    logger.debug("Upload endpoint called")
    
    if 'video' not in request.files:
        logger.error("No video file in request")
        return jsonify({'success': False, 'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        logger.error("Empty filename")
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    if not allowed_file(file.filename):
        logger.error(f"Invalid file type: {file.filename}")
        return jsonify({'success': False, 'error': 'Invalid file type'}), 400
    
    try:
        index_id = create_index()
        session['index_id'] = index_id
        logger.debug(f"Created index: {index_id}")
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        logger.debug(f"Saved file to: {filepath}")
        
        logger.debug("Starting video indexing")
        task = client.task.create(
            index_id=index_id,
            file=filepath
        )
        
        def on_update(task):
            logger.debug(f"Task status: {task.status}")
        
        task.wait_for_done(sleep_interval=5, callback=on_update)
        
        if task.status != "ready":
            raise Exception(f"Indexing failed with status {task.status}")
        
        session['video_id'] = task.video_id
        logger.debug(f"Video indexed successfully, ID: {task.video_id}")
        
        return jsonify({
            'success': True,
            'message': 'Video uploaded and indexed successfully',
            'video_id': task.video_id
        })
        
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.debug("Cleaned up temporary file")

@app.route('/analyze', methods=['POST'])
def analyze():
    logger.debug("Analysis endpoint called")
    if 'video_id' not in session:
        logger.error("No video_id in session")
        return jsonify({'success': False, 'error': 'No video indexed'}), 400
    
    video_id = session['video_id']
    index_id = session['index_id']
    logger.debug(f"Analyzing video: {video_id} from index: {index_id}")
    
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
        logger.debug(f"Retrieved video URL: {video_url is not None}")
        
        analysis_response = client.generate.text(
            video_id=video_id,
            prompt="""Analyze this video and provide a detailed report in JSON format with the following structure:
            {
                "summary": "Brief overview of the video content",
                "duration": "Video duration in seconds",
                "violation_count": "Total number of violations detected",
                "risk_level": "high/medium/low",
                "violations": [
                    {
                        "type": "violation category",
                        "description": "detailed description",
                        "timestamp": "time in seconds",
                        "severity": "high/medium/low"
                    }
                ],
                "policy_categories": {
                    "violence": false,
                    "hate_speech": false,
                    "adult_content": false,
                    "harassment": false,
                    "dangerous_acts": false,
                    "misinformation": false
                },
                "recommendations": ["Action items"]
            }"""
        )
        
        try:
            analysis_data = json.loads(str(analysis_response.data))
            logger.debug("Successfully parsed analysis response")
        except json.JSONDecodeError:
            logger.warning("Failed to parse JSON response, using fallback")
            analysis_data = {
                "summary": str(analysis_response.data),
                "duration": 0,
                "violation_count": 0,
                "risk_level": "low",
                "violations": [],
                "policy_categories": {
                    "violence": False,
                    "hate_speech": False,
                    "adult_content": False,
                    "harassment": False,
                    "dangerous_acts": False,
                    "misinformation": False
                },
                "recommendations": []
            }
        
        return jsonify({
            'success': True,
            'video_url': video_url,
            'analysis': analysis_data,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)