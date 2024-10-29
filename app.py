from flask import Flask, render_template, request, jsonify, flash
import os
from dotenv import load_dotenv
from twelvelabs import TwelveLabs
import requests
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

API_KEY = os.getenv('API_KEY')  
INDEX_ID = os.getenv('INDEX_ID') 

if not API_KEY or not INDEX_ID:
    logger.error("Missing required environment variables. Please check .env file.")
    raise ValueError("Missing required environment variables: TWELVELABS_API_KEY or TWELVELABS_INDEX_ID")

try:
    client = TwelveLabs(api_key=API_KEY)
except Exception as e:
    logger.error(f"Failed to initialize TwelveLabs client: {e}")
    raise

def get_initial_classes():
    return [
    {
        "name": "Violence",
        "prompts": [
            "physical altercation",
            "weapon usage",
            "graphic injury",
            "cruel acts towards animals",
            "depiction of torture"
        ]
    },
    {
        "name": "HateSpeech",
        "prompts": [
            "racial slurs",
            "discriminatory language",
            "promotion of extremist ideologies",
            "religious intolerance",
            "gender-based harassment"
        ]
    },
    {
        "name": "ChildExploitation",
        "prompts": [
            "content involving minors in inappropriate situations",
            "child labor",
            "predatory behavior towards children",
            "sharing of private information about minors",
            "content encouraging harmful behavior in children"
        ]
    },
    {
        "name": "Misinformation",
        "prompts": [
            "false health claims",
            "election misinformation",
            "conspiracy theories",
            "pseudoscientific content",
            "deliberately misleading news"
        ]
    },
    {
        "name": "CopyrightViolation",
        "prompts": [
            "unauthorized use of copyrighted material",
            "pirated content",
            "counterfeit product promotion",
            "plagiarism",
            "misuse of trademarks"
        ]
    },
    {
        "name": "GraphicContent",
        "prompts": [
            "excessive gore",
            "graphic medical procedures",
            "animal cruelty",
            "disturbing accident footage",
            "extreme body modifications"
        ]
    },
    {
        "name": "Harassment",
        "prompts": [
            "cyberbullying",
            "doxxing",
            "threats of violence",
            "stalking behavior",
            "coordinated harassment campaigns"
        ]
    },
    {
        "name": "SexualContent",
        "prompts": [
            "pornographic material",
            "explicit sexual descriptions",
            "non-consensual intimate imagery",
            "solicitation for sexual services",
            "sexualization of minors"
        ]
    },
    {
        "name": "Spam",
        "prompts": [
            "unsolicited commercial content",
            "excessive self-promotion",
            "bot-generated messages",
            "phishing attempts",
            "clickbait content"
        ]
    },
    {
        "name": "PrivacyViolation",
        "prompts": [
            "sharing personal information without consent",
            "unauthorized biometric data collection",
            "violation of medical privacy",
            "exposure of confidential business information",
            "sharing of private messages or media"
        ]
    },
    {
        "name": "SelfHarm",
        "prompts": [
            "promotion of eating disorders",
            "suicide ideation",
            "self-injury content",
            "dangerous challenges or trends",
            "glorification of mental illness"
        ]
    },
        {
        "name": "SelfHarm",
        "prompts": [
            "promotion of eating disorders",
            "suicide ideation",
            "self-injury content",
            "dangerous challenges or trends",
            "glorification of mental illness"
        ]
    },
    {
        "name": "InappropriateVideoContent",
        "prompts": [
            "mildly suggestive scenes",
            "non-extreme pranks or stunts",
            "mild profanity or crude humor",
            "depiction of unsafe behavior",
            "controversial but non-explicit political content"
        ]
    },
    {
        "name": "VideoTechnicalIssues",
        "prompts": [
            "poor video quality or heavy compression artifacts",
            "severe audio-video desynchronization",
            "frequent buffering or playback issues",
            "incorrect aspect ratio or cropping",
            "unintended background noise or disruptions"
        ]
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
    "SelfHarm": "⛔",
    "ChildExploitation": "👶❌",  
    "CopyrightViolation": "©️",    
    "Spam": "🔧",                  
    "InappropriateVideoContent": "📹⚠️",  
    "VideoTechnicalIssues": "🎥⚡"   
}

def classify_videos(selected_classes):
    try:
        logger.debug(f"Attempting to classify videos with classes: {selected_classes}")
        
        # Format classes for the API
        formatted_classes = []
        for class_info in selected_classes:
            name = class_info.get('name')
            if name:
                formatted_class = {
                    "name": name,
                    "prompts": next((c['prompts'] for c in get_initial_classes() if c['name'] == name), [])
                }
                formatted_classes.append(formatted_class)

        logger.debug(f"Formatted classes for API: {formatted_classes}")

        response = client.classify.index(
            index_id=INDEX_ID,
            options=["visual"],
            classes=formatted_classes,
            include_clips=True
        )
        
        logger.debug(f"Classification response received: {response}")
        return response
        
    except Exception as e:
        logger.error(f"Classification failed: {str(e)}")
        raise Exception(f"Classification failed: {str(e)}")

def get_video_urls(video_ids):
    base_url = f"https://api.twelvelabs.io/v1.2/indexes/{INDEX_ID}/videos/{{}}"
    headers = {"x-api-key": API_KEY, "Content-Type": "application/json"}
    video_urls = {}
    
    for video_id in video_ids:
        try:
            logger.debug(f"Fetching URL for video ID: {video_id}")
            response = requests.get(base_url.format(video_id), headers=headers)
            response.raise_for_status()
            data = response.json()
            if 'hls' in data and 'video_url' in data['hls']:
                video_urls[video_id] = data['hls']['video_url']
                logger.debug(f"Successfully retrieved URL for video ID: {video_id}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch video URL for ID {video_id}: {str(e)}")
            continue
    
    return video_urls

@app.route('/')
def index():
    classes = get_initial_classes()
    return render_template('index.html', classes=classes, category_emojis=CATEGORY_EMOJIS)

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        logger.debug("Received analyze request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received in request")
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        selected_classes = data.get('classes', [])
        logger.debug(f"Selected classes: {selected_classes}")
        
        if not selected_classes:
            logger.error("No classes selected")
            return jsonify({'success': False, 'error': 'No classes selected'}), 400
        
        results = classify_videos(selected_classes)
        
        if not results or not hasattr(results, 'data') or not results.data:
            logger.error("No results returned from classification")
            return jsonify({'success': False, 'error': 'No videos found in the index'}), 404
        
        video_ids = [data.video_id for data in results.data]
        logger.debug(f"Fetching URLs for video IDs: {video_ids}")
        video_urls = get_video_urls(video_ids)
        
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
        
        logger.debug(f"Sending response with {len(analysis_results)} results")
        return jsonify({
            'success': True, 
            'results': analysis_results
        })
        
    except Exception as e:
        logger.error(f"Error in analyze route: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)
