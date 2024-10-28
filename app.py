from flask import Flask, render_template, request, jsonify, flash
from werkzeug.utils import secure_filename
import os
from dotenv import load_dotenv
from twelvelabs import TwelveLabs
import requests

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

API_KEY = os.getenv('API_KEY')
INDEX_ID = os.getenv('INDEX_ID')

client = TwelveLabs(api_key=API_KEY)

def get_initial_classes():
    return [
        {
            "name": "Violence",
            "prompts": ["physical altercation", "weapon usage", "graphic injury", "cruel acts"]
        },
        {
            "name": "HateSpeech",
            "prompts": ["racial slurs", "discriminatory language", "extremist ideologies"]
        },
        {
            "name": "GraphicContent",
            "prompts": ["excessive gore", "graphic content", "disturbing footage"]
        },
        {
            "name": "Harassment",
            "prompts": ["cyberbullying", "threats", "stalking behavior"]
        },
        {
            "name": "PrivacyViolation",
            "prompts": ["personal information", "unauthorized data", "private content"]
        }
    ]

CATEGORY_EMOJIS = {
    "Violence": "⚔️",
    "HateSpeech": "🚫",
    "GraphicContent": "⚠️",
    "Harassment": "🚷",
    "PrivacyViolation": "🔒",
    "SexualContent": "🔞",
    "Misinformation": "❌",
    "SelfHarm": "⛔"
}

def classify_videos(selected_classes):
    try:
        return client.classify.index(
            index_id=INDEX_ID,
            options=["visual"],
            classes=selected_classes,
            include_clips=True
        )
    except Exception as e:
        raise Exception(f"Classification failed: {str(e)}")

def get_video_urls(video_ids):
    base_url = f"https://api.twelvelabs.io/v1.2/indexes/{INDEX_ID}/videos/{{}}"
    headers = {"x-api-key": API_KEY, "Content-Type": "application/json"}
    video_urls = {}
    
    for video_id in video_ids:
        try:
            response = requests.get(base_url.format(video_id), headers=headers)
            response.raise_for_status()
            data = response.json()
            if 'hls' in data and 'video_url' in data['hls']:
                video_urls[video_id] = data['hls']['video_url']
        except requests.exceptions.RequestException:
            continue
    
    return video_urls

@app.route('/')
def index():
    classes = get_initial_classes()
    return render_template('index.html', classes=classes, category_emojis=CATEGORY_EMOJIS)

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.get_json()
        selected_classes = data.get('classes', [])
        
        if not selected_classes:
            return jsonify({'error': 'No classes selected'}), 400
        
        # Perform classification
        results = classify_videos(selected_classes)
        
        if not results.data:
            return jsonify({'error': 'No videos found in the index'}), 400
        
        # Get video URLs
        video_ids = [data.video_id for data in results.data]
        video_urls = get_video_urls(video_ids)
        
        # Format results
        analysis_results = []
        for video_data in results.data:
            result = {
                'video_id': video_data.video_id,
                'video_url': video_urls.get(video_data.video_id),
                'classes': [
                    {
                        'name': c.name,
                        'score': c.score,
                        'duration_ratio': getattr(c, 'duration_ratio', None)
                    } for c in video_data.classes
                ]
            }
            analysis_results.append(result)
        
        return jsonify({
            'success': True, 
            'results': analysis_results
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)