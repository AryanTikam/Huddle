from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai import generate_minutes_of_meeting
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId

minutes_bp = Blueprint('minutes', __name__)

def get_mongo():
    return current_app.mongo.db

def is_valid_objectid(id_string):
    try:
        ObjectId(id_string)
        return True
    except (InvalidId, TypeError):
        return False

@minutes_bp.route('/<meeting_id>', methods=['POST'])
@jwt_required()
def generate_meeting_minutes(meeting_id):
    user_id = get_jwt_identity()
    db = get_mongo()

    print(f"[DEBUG] Generating minutes for meeting_id: {meeting_id}")

    # Query meeting
    if is_valid_objectid(meeting_id):
        query = {'$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}], 'user_id': user_id}
    else:
        query = {'id': meeting_id, 'user_id': user_id}

    meeting = db.meetings.find_one(query)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    # Get transcript
    transcript = request.json.get('transcript') if request.json else None
    if not transcript:
        # Search transcription
        search_ids = [meeting.get('id'), str(meeting['_id']), meeting_id]
        search_ids = [sid for sid in search_ids if sid]
        doc = None
        for sid in search_ids:
            doc = db.transcriptions.find_one({'meeting_id': sid})
            if doc:
                break
        if not doc:
            # Sample transcript for testing
            transcript = """Speaker 1: Welcome to today's meeting..."""  # shortened for brevity
            storage_id = meeting.get('id', meeting_id)
            db.transcriptions.update_one(
                {'meeting_id': storage_id},
                {'$set': {
                    'meeting_id': storage_id,
                    'transcript': transcript,
                    'created_at': datetime.utcnow(),
                    'language': 'en-US'
                }},
                upsert=True
            )
        else:
            transcript = doc.get('transcript', '')

    if not transcript.strip():
        return jsonify({'error': 'Empty transcript'}), 400

    try:
        minutes = generate_minutes_of_meeting(transcript)
        storage_id = meeting.get('id', meeting_id)
        db.minutes.update_one(
            {'meeting_id': storage_id},
            {'$set': {
                'meeting_id': storage_id,
                'minutes': minutes,
                'created_at': datetime.utcnow()
            }},
            upsert=True
        )
        return jsonify({'minutes': minutes})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate minutes: {str(e)}'}), 500
 
@minutes_bp.route('/<meeting_id>', methods=['GET'])
@jwt_required()
def get_meeting_minutes(meeting_id):
    user_id = get_jwt_identity()
    db = get_mongo()

    if is_valid_objectid(meeting_id):
        query = {'$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}], 'user_id': user_id}
    else:
        query = {'id': meeting_id, 'user_id': user_id}

    meeting = db.meetings.find_one(query)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    search_id = meeting.get('id', str(meeting['_id']))
    doc = db.minutes.find_one({'meeting_id': search_id})
    if not doc and is_valid_objectid(meeting_id):
        doc = db.minutes.find_one({'meeting_id': str(meeting['_id'])})
    if not doc:
        doc = db.minutes.find_one({'meeting_id': meeting_id})

    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    return jsonify({'error': 'Minutes not found'}), 404
