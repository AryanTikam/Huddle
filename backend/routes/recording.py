from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import uuid
import base64
import os
from utils.stt_service import stt_service

recording_bp = Blueprint('recording', __name__)

@recording_bp.route('/start', methods=['POST'])
@jwt_required()
def start_recording():
    user_id = get_jwt_identity()
    data = request.json
    
    meeting_id = str(uuid.uuid4())
    meeting_data = {
        'id': meeting_id,
        'user_id': user_id,
        'title': data.get('title'),
        'language': data.get('language', 'en'),
        'status': 'recording',
        'created_at': datetime.utcnow(),
        'participants': [],
        'transcript': [],
        'speakers': {}
    }
    
    current_app.mongo.db.meetings.insert_one(meeting_data)
    return jsonify({'meeting_id': meeting_id, 'status': 'started'})

@recording_bp.route('/process-text', methods=['POST'])
@jwt_required()
def process_transcribed_text():
    """Process text that was transcribed on the frontend"""
    user_id = get_jwt_identity()
    data = request.json
    meeting_id = data.get('meeting_id')
    transcript_text = data.get('text')
    speaker = data.get('speaker', 'Speaker A')
    confidence = data.get('confidence', 1.0)
    
    if not transcript_text:
        return jsonify({'error': 'No text provided'}), 400
    
    # Update meeting with new transcript
    current_app.mongo.db.meetings.update_one(
        {'id': meeting_id},
        {'$push': {'transcript': {
            'text': transcript_text, 
            'speaker': speaker,
            'timestamp': datetime.utcnow(),
            'confidence': confidence
        }}}
    )
    
    return jsonify({'status': 'processed', 'text': transcript_text})

@recording_bp.route('/stop/<meeting_id>', methods=['POST'])
@jwt_required()
def stop_recording(meeting_id):
    user_id = get_jwt_identity()
    
    meeting = current_app.mongo.db.meetings.find_one({
        'id': meeting_id, 
        'user_id': user_id
    })
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    current_time = datetime.utcnow()
    
    result = current_app.mongo.db.meetings.update_one(
        {'id': meeting_id, 'user_id': user_id},
        {'$set': {
            'status': 'completed', 
            'ended_at': current_time,
            'updated_at': current_time
        }}
    )
    
    if result.modified_count > 0:
        start_time = meeting.get('created_at')
        if start_time:
            duration_seconds = (current_time - start_time).total_seconds()
            print(f"Meeting {meeting_id} duration: {duration_seconds/60:.1f} minutes")
    
    return jsonify({
        'status': 'stopped',
        'ended_at': current_time.isoformat()
    })


@recording_bp.route('/transcribe-audio', methods=['POST'])
@jwt_required()
def transcribe_audio():
    """Accept base64-encoded audio data and transcribe using Whisper."""
    user_id = get_jwt_identity()
    data = request.json
    audio_b64 = data.get('audio_data')
    language = data.get('language', 'en-US')
    meeting_id = data.get('meeting_id')
    speaker = data.get('speaker', 'Speaker')

    if not audio_b64:
        return jsonify({'error': 'No audio data provided'}), 400

    if not stt_service.is_available:
        return jsonify({'error': 'Whisper is not installed on the server'}), 503

    try:
        audio_bytes = base64.b64decode(audio_b64)

        # Skip very small audio (likely silence or too short to transcribe)
        if len(audio_bytes) < 1000:
            return jsonify({'text': '', 'status': 'success'})

        lang_code = language.split('-')[0] if language else 'en'
        text = stt_service.transcribe(audio_bytes, language=lang_code)

        if text:
            print(f'[STT] Whisper transcribed: "{text[:80]}..."' if len(text) > 80 else f'[STT] Whisper transcribed: "{text}"')
        else:
            return jsonify({'text': '', 'status': 'success'})

        # Save transcript entry to the meeting
        if meeting_id:
            current_app.mongo.db.meetings.update_one(
                {'id': meeting_id},
                {'$push': {'transcript': {
                    'text': text,
                    'speaker': speaker,
                    'timestamp': datetime.utcnow(),
                    'confidence': 0.9
                }}}
            )

        return jsonify({'text': text, 'status': 'success', 'method': 'whisper'})

    except Exception as e:
        print(f'[STT] Transcription error: {str(e)}')
        return jsonify({'error': str(e), 'status': 'error'}), 500