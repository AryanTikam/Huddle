from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from dotenv import load_dotenv
from bson.objectid import ObjectId
import re
import os
import uuid
import traceback

load_dotenv()

app = Flask(__name__)

# Production/Development environment detection
IS_PRODUCTION = os.getenv('FLASK_ENV') == 'production' or os.getenv('RENDER') is not None

print(f"[DEBUG] IS_PRODUCTION: {IS_PRODUCTION}")
print(f"[DEBUG] FLASK_ENV: {os.getenv('FLASK_ENV')}")
print(f"[DEBUG] RENDER env var: {os.getenv('RENDER')}")

# Configure CORS with unified regex patterns for all environments
ALLOWED_ORIGIN_PATTERNS = [
    # Local development
    re.compile(r'^http://localhost(?::\d+)?$'),
    re.compile(r'^http://127\.0\.0\.1(?::\d+)?$'),
    # Production deployments
    re.compile(r'^https://huddle-gathersmarter\.netlify\.app/?$'),
    re.compile(r'^https://huddle-bugz\.onrender\.com/?$'),
    # Chrome extensions
    re.compile(r'^chrome-extension://.*$')
]

def is_allowed_origin(origin):
    """Check if origin is allowed using regex patterns."""
    if not origin:
        return False
    return any(pattern.match(origin) for pattern in ALLOWED_ORIGIN_PATTERNS)

CORS(app, 
     origins=ALLOWED_ORIGIN_PATTERNS, 
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

print(f"[DEBUG] CORS initialized with {len(ALLOWED_ORIGIN_PATTERNS)} origin patterns")

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        response = app.make_response('')
        response.status_code = 200
        origin = request.headers.get('Origin', '')
        if is_allowed_origin(origin):
            response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '')
    if is_allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# Initialize Socket.IO with proper CORS for production
# Use '*' to allow all origins (chrome-extension:// origins can't be pattern-matched)
# The HTTP CORS middleware already validates origins for regular requests
socketio = SocketIO(app, 
                   cors_allowed_origins='*',
                   logger=False,
                   engineio_logger=False,
                   transports=['polling', 'websocket'],
                   async_mode='threading',
                   ping_timeout=60,
                   ping_interval=25)

# MongoDB connection debugging
mongo_uri = os.getenv("MONGODB_URI") if IS_PRODUCTION else "mongodb://localhost:27017/huddle"
print(f"[DEBUG] Raw MONGODB_URI from env: {os.getenv('MONGODB_URI')}")
print(f"[DEBUG] Final MongoDB URI: {mongo_uri}")
print(f"[DEBUG] MongoDB URI type: {type(mongo_uri)}")
print(f"[DEBUG] MongoDB URI length: {len(mongo_uri) if mongo_uri else 'None'}")

app.config["MONGO_URI"] = mongo_uri
print(f"[DEBUG] Flask app MONGO_URI config: {app.config['MONGO_URI']}")

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET", "your-secret-key-change-this")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

# Initialize MongoDB with extensive debugging
print(f"[DEBUG] Starting MongoDB initialization...")
try:
    mongo = PyMongo(app)
    print(f"[DEBUG] PyMongo instance created: {mongo}")
    print(f"[DEBUG] PyMongo client: {mongo.cx}")
    print(f"[DEBUG] PyMongo db: {mongo.db}")
    
    # Test the connection
    if mongo.db is not None:
        print(f"[DEBUG] Database object exists, attempting connection test...")
        try:
            # Try to access server info
            server_info = mongo.cx.server_info()
            print(f"[DEBUG] MongoDB server info: {server_info}")
            
            # Try to list collections
            collections = mongo.db.list_collection_names()
            print(f"[DEBUG] Available collections: {collections}")
            
            # Try a simple operation
            test_result = mongo.db.users.count_documents({})
            print(f"[DEBUG] User collection count: {test_result}")
            
            print(f"[DEBUG] ✅ MongoDB connection successful!")
            
        except Exception as e:
            print(f"[DEBUG] ❌ MongoDB connection test failed: {e}")
            print(f"[DEBUG] Connection error type: {type(e)}")
            print(f"[DEBUG] Connection error details:")
            traceback.print_exc()
    else:
        print(f"[DEBUG] ❌ mongo.db is None - connection failed during initialization")
        
except Exception as e:
    print(f"[DEBUG] ❌ Failed to create PyMongo instance: {e}")
    print(f"[DEBUG] PyMongo creation error type: {type(e)}")
    print(f"[DEBUG] PyMongo creation error details:")
    traceback.print_exc()
    mongo = None

# Set app.mongo for routes
app.mongo = mongo

# Additional debugging for PyMongo state
if mongo:
    print(f"[DEBUG] mongo.cx type: {type(mongo.cx)}")
    print(f"[DEBUG] mongo.db type: {type(mongo.db)}")
    try:
        print(f"[DEBUG] Database name: {mongo.db.name}")
    except Exception as e:
        print(f"[DEBUG] Could not get database name: {e}")
else:
    print(f"[DEBUG] ❌ mongo is None - all database operations will fail")

jwt = JWTManager(app)

# Store active room connections with mute status and metadata
active_rooms = {}
app.config['ACTIVE_ROOMS'] = active_rooms

# Map socket IDs to authenticated user info
socket_user_map = {}

# JWT Error handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Token has expired'}), 401

# ─── Helper: fetch meeting settings from DB ───────────────────────
def _get_meeting_settings(room_id):
    """Fetch meeting settings from MongoDB for a given room_id."""
    try:
        if mongo and mongo.db:
            meeting = mongo.db.meetings.find_one({'room_id': room_id})
            if meeting:
                return meeting.get('settings', {}), meeting
    except Exception as e:
        print(f'[SOCKET] Error fetching meeting settings: {e}')
    return {}, None

# ─── Socket.IO events for secure WebRTC signaling ─────────────────
@socketio.on('connect')
def on_connect(auth=None):
    """Authenticated socket connection with optional JWT token."""
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get('token')
    if not token:
        token = request.args.get('token')

    user_info = {'authenticated': False, 'user_id': None, 'user_name': None}

    if token:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(token)
            user_id = decoded.get('sub')
            if user_id and mongo and mongo.db:
                user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
                if user:
                    user_info = {
                        'authenticated': True,
                        'user_id': user_id,
                        'user_name': user.get('name', 'Unknown')
                    }
        except Exception as e:
            print(f'[SOCKET] JWT validation failed: {e}')

    socket_user_map[request.sid] = user_info
    print(f'[SOCKET] Client connected: {request.sid} (authenticated: {user_info["authenticated"]})')

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    print(f'[SOCKET] Client disconnected: {sid}')

    # Clean up user from all rooms
    for room_id in list(active_rooms.keys()):
        if sid in active_rooms[room_id]:
            user_info = active_rooms[room_id][sid]
            del active_rooms[room_id][sid]

            emit('user-left', {
                'socket_id': sid,
                'user_id': user_info['user_id']
            }, room=room_id)

            print(f'[SOCKET] Removed {user_info["user_name"]} from room {room_id}')

            # Auto-cleanup empty rooms
            if not active_rooms[room_id]:
                del active_rooms[room_id]
                print(f'[SOCKET] Room {room_id} empty — cleaned up')

    # Clean up socket user map
    socket_user_map.pop(sid, None)

@socketio.on('join-room')
def on_join_room(data):
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    user_name = data.get('user_name')

    print(f'[SOCKET] User {user_name} (ID: {user_id}) joining room {room_id}')

    if not room_id:
        emit('error', {'message': 'Room ID is required'})
        return

    room_id = room_id.upper()

    # Fetch meeting settings from DB
    settings, meeting = _get_meeting_settings(room_id)
    mute_on_join = settings.get('mute_on_join', True)
    video_on_join = settings.get('video_on_join', True)
    auto_transcription = settings.get('auto_transcription', True)
    participant_limit = settings.get('participant_limit', 10)

    # Enforce participant limit
    if room_id in active_rooms and len(active_rooms[room_id]) >= participant_limit:
        emit('error', {'message': 'Meeting is full', 'code': 'ROOM_FULL'})
        return

    join_room(room_id)

    if room_id not in active_rooms:
        active_rooms[room_id] = {}

    # Determine if this user is the host
    is_host = False
    if meeting:
        is_host = (meeting.get('host_id') == user_id)

    # Add user to room with server-tracked mute/video status
    active_rooms[room_id][request.sid] = {
        'user_id': user_id,
        'user_name': user_name,
        'is_muted': mute_on_join,
        'is_video_off': not video_on_join,
        'is_screen_sharing': False,
        'is_host': is_host
    }

    print(f'[SOCKET] Room {room_id}: {len(active_rooms[room_id])} participants')

    # Get existing users
    existing_users = []
    for sid, uinfo in active_rooms[room_id].items():
        if sid != request.sid:
            existing_users.append({
                'user_id': uinfo['user_id'],
                'user_name': uinfo['user_name'],
                'socket_id': sid,
                'is_muted': uinfo.get('is_muted', True),
                'is_video_off': uinfo.get('is_video_off', False),
                'is_screen_sharing': uinfo.get('is_screen_sharing', False),
                'is_host': uinfo.get('is_host', False)
            })

    # Send existing users + enforced settings to the new user
    emit('existing-users', existing_users)
    emit('meeting-settings', {
        'mute_on_join': mute_on_join,
        'video_on_join': video_on_join,
        'auto_transcription': auto_transcription,
        'participant_limit': participant_limit,
        'is_host': is_host
    })

    # Notify existing users about the new participant
    emit('user-joined', {
        'user_id': user_id,
        'user_name': user_name,
        'socket_id': request.sid,
        'is_muted': mute_on_join,
        'is_video_off': not video_on_join,
        'is_host': is_host
    }, room=room_id, include_self=False)

# ─── WebRTC Signaling ─────────────────────────────────────────────
@socketio.on('offer')
def on_offer(data):
    target_id = data.get('target')
    emit('offer', {
        'offer': data.get('offer'),
        'caller': request.sid
    }, room=target_id)

@socketio.on('answer')
def on_answer(data):
    target_id = data.get('target')
    emit('answer', {
        'answer': data.get('answer'),
        'caller': request.sid
    }, room=target_id)

@socketio.on('ice-candidate')
def on_ice_candidate(data):
    target_id = data.get('target')
    emit('ice-candidate', {
        'candidate': data.get('candidate'),
        'caller': request.sid
    }, room=target_id)

# ─── Transcript with server-side mute enforcement ─────────────────
@socketio.on('transcript-update')
def on_transcript_update(data):
    room_id = data.get('room_id')
    transcript_data = data.get('transcript')

    if not room_id or not transcript_data:
        return

    room_id = room_id.upper()

    # SERVER-SIDE ENFORCEMENT: Check actual mute status from our records
    # Do NOT trust the client's is_muted field
    sender_info = active_rooms.get(room_id, {}).get(request.sid)
    if not sender_info:
        print(f'[SOCKET] Transcript rejected: sender {request.sid} not in room {room_id}')
        return

    if sender_info.get('is_muted', True):
        print(f'[SOCKET] Transcript BLOCKED (server-side): {sender_info["user_name"]} is muted')
        return

    # Check if transcription is enabled for this meeting
    settings, _ = _get_meeting_settings(room_id)
    if not settings.get('auto_transcription', True):
        print(f'[SOCKET] Transcript BLOCKED: transcription disabled for room {room_id}')
        return

    # Safe to broadcast — user is verified unmuted
    transcript_data['is_muted'] = False  # Override with server truth
    emit('transcript-update', transcript_data, room=room_id, include_self=False)
    print(f'[SOCKET] Transcript OK from {sender_info["user_name"]}')

# ─── Mute status with server tracking ─────────────────────────────
@socketio.on('participant-mute-status')
def on_participant_mute_status(data):
    room_id = data.get('room_id')
    is_muted = data.get('is_muted', True)
    user_name = data.get('user_name', 'Unknown')

    if not room_id:
        return
    room_id = room_id.upper()

    # Always use the sender's actual socket ID
    actual_sid = request.sid

    # Update server-side mute status
    if room_id in active_rooms and actual_sid in active_rooms[room_id]:
        active_rooms[room_id][actual_sid]['is_muted'] = is_muted
        print(f'[SOCKET] Mute status: {user_name} -> {"muted" if is_muted else "unmuted"} (server-tracked)')

        emit('participant-mute-status', {
            'socket_id': actual_sid,
            'is_muted': is_muted,
            'user_name': user_name
        }, room=room_id, include_self=False)

# ─── Video status tracking ────────────────────────────────────────
@socketio.on('participant-video-status')
def on_participant_video_status(data):
    room_id = data.get('room_id')
    is_video_off = data.get('is_video_off', False)
    user_name = data.get('user_name', 'Unknown')

    if not room_id:
        return
    room_id = room_id.upper()

    actual_sid = request.sid
    if room_id in active_rooms and actual_sid in active_rooms[room_id]:
        active_rooms[room_id][actual_sid]['is_video_off'] = is_video_off

        emit('participant-video-status', {
            'socket_id': actual_sid,
            'is_video_off': is_video_off,
            'user_name': user_name
        }, room=room_id, include_self=False)

# ─── Screen sharing events ────────────────────────────────────────
@socketio.on('screen-share-started')
def on_screen_share_started(data):
    room_id = data.get('room_id')
    if not room_id:
        return
    room_id = room_id.upper()

    if room_id in active_rooms and request.sid in active_rooms[room_id]:
        active_rooms[room_id][request.sid]['is_screen_sharing'] = True
        emit('screen-share-started', {
            'socket_id': request.sid,
            'user_name': active_rooms[room_id][request.sid]['user_name']
        }, room=room_id, include_self=False)

@socketio.on('screen-share-stopped')
def on_screen_share_stopped(data):
    room_id = data.get('room_id')
    if not room_id:
        return
    room_id = room_id.upper()

    if room_id in active_rooms and request.sid in active_rooms[room_id]:
        active_rooms[room_id][request.sid]['is_screen_sharing'] = False
        emit('screen-share-stopped', {
            'socket_id': request.sid,
            'user_name': active_rooms[room_id][request.sid]['user_name']
        }, room=room_id, include_self=False)

# ─── Host controls ────────────────────────────────────────────────
@socketio.on('force-mute')
def on_force_mute(data):
    """Host can force-mute a participant."""
    room_id = data.get('room_id')
    target_sid = data.get('target_socket_id')

    if not room_id:
        return
    room_id = room_id.upper()

    # Verify sender is host
    sender = active_rooms.get(room_id, {}).get(request.sid)
    if not sender or not sender.get('is_host', False):
        emit('error', {'message': 'Only the host can force-mute participants'})
        return

    # Update target's mute status
    if target_sid in active_rooms.get(room_id, {}):
        active_rooms[room_id][target_sid]['is_muted'] = True
        target_name = active_rooms[room_id][target_sid]['user_name']

        # Notify the target that they've been muted
        emit('force-muted', {
            'muted_by': sender['user_name']
        }, room=target_sid)

        # Broadcast to all
        emit('participant-mute-status', {
            'socket_id': target_sid,
            'is_muted': True,
            'user_name': target_name,
            'forced_by': sender['user_name']
        }, room=room_id, include_self=True)

        print(f'[SOCKET] Host {sender["user_name"]} force-muted {target_name}')

# ─── Reactions ────────────────────────────────────────────────────
@socketio.on('reaction')
def on_reaction(data):
    room_id = data.get('room_id')
    if not room_id:
        return
    room_id = room_id.upper()

    sender = active_rooms.get(room_id, {}).get(request.sid)
    if sender:
        emit('reaction', {
            'socket_id': request.sid,
            'user_name': sender['user_name'],
            'emoji': data.get('emoji', '👍')
        }, room=room_id, include_self=False)

# ─── Leave / End meeting ──────────────────────────────────────────
@socketio.on('leave-room')
def on_leave_room(data):
    room_id = data.get('room_id')
    if not room_id:
        return
    room_id = room_id.upper()

    if request.sid in active_rooms.get(room_id, {}):
        user_info = active_rooms[room_id][request.sid]
        del active_rooms[room_id][request.sid]

        leave_room(room_id)

        emit('user-left', {
            'socket_id': request.sid,
            'user_id': user_info['user_id']
        }, room=room_id)

        print(f'[SOCKET] {user_info["user_name"]} left room {room_id}')

        # Auto-cleanup empty rooms
        if not active_rooms.get(room_id):
            active_rooms.pop(room_id, None)
            print(f'[SOCKET] Room {room_id} empty — cleaned up')

@socketio.on('meeting-ended')
def on_meeting_ended(data):
    room_id = data.get('room_id')
    host_name = data.get('host_name', 'Host')
    meeting_data = data.get('meeting_data', {})

    if not room_id:
        return
    room_id = room_id.upper()

    # Verify sender is host
    sender = active_rooms.get(room_id, {}).get(request.sid)
    if not sender or not sender.get('is_host', False):
        emit('error', {'message': 'Only the host can end the meeting'})
        return

    print(f'[SOCKET] Meeting {room_id} ended by host {host_name}')

    emit('meeting-ended', {
        'room_id': room_id,
        'host_name': host_name,
        'ended_at': datetime.utcnow().isoformat() + 'Z',
        'message': f'Meeting ended by {host_name}',
        'meeting_data': meeting_data
    }, room=room_id, include_self=False)

    # Clean up room
    active_rooms.pop(room_id, None)
    print(f'[SOCKET] Cleaned up room: {room_id}')

@socketio.on('transcription-toggled')
def on_transcription_toggled(data):
    room_id = data.get('room_id')
    enabled = data.get('enabled', False)
    host_name = data.get('host_name', 'Host')

    if not room_id:
        return
    room_id = room_id.upper()

    # Verify sender is host
    sender = active_rooms.get(room_id, {}).get(request.sid)
    if not sender or not sender.get('is_host', False):
        emit('error', {'message': 'Only the host can toggle transcription'})
        return

    print(f'[SOCKET] Transcription {"enabled" if enabled else "disabled"} in room {room_id}')

    emit('transcription-status-changed', {
        'enabled': enabled,
        'message': f'Transcription {"enabled" if enabled else "disabled"} by {host_name}',
        'privacy_notice': 'Only unmuted participants will be transcribed'
    }, room=room_id, include_self=False)

# Authentication routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    print(f"[DEBUG] Registration attempt started")
    print(f"[DEBUG] mongo object: {mongo}")
    print(f"[DEBUG] mongo.db: {mongo.db if mongo else 'None'}")
    
    try:
        data = request.json
        print(f"[DEBUG] Registration data received: {data.keys() if data else 'None'}")
        
        if not data or not all(k in data for k in ('name', 'email', 'password')):
            print(f"[DEBUG] Missing required fields")
            return jsonify({'error': 'Missing required fields'}), 400
        
        print(f"[DEBUG] Attempting to check existing user...")
        if mongo is None or mongo.db is None:
            print(f"[DEBUG] ❌ No MongoDB connection available")
            return jsonify({'error': 'Database connection unavailable'}), 500
            
        existing_user = mongo.db.users.find_one({'email': data['email']})
        print(f"[DEBUG] Existing user check result: {existing_user is not None}")
        
        if existing_user:
            print(f"[DEBUG] User already exists")
            return jsonify({'error': 'User already exists'}), 400
        
        default_folders = [
            {'id': 'recent', 'name': 'Recent', 'color': '#3B82F6', 'created_at': datetime.utcnow()},
            {'id': 'work', 'name': 'Work', 'color': '#10B981', 'created_at': datetime.utcnow()},
            {'id': 'personal', 'name': 'Personal', 'color': '#F59E0B', 'created_at': datetime.utcnow()}
        ]
        
        user_data = {
            'name': data['name'],
            'email': data['email'],
            'password': generate_password_hash(data['password']),
            'created_at': datetime.utcnow(),
            'folders': default_folders
        }
        
        print(f"[DEBUG] Attempting to insert user...")
        result = mongo.db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        print(f"[DEBUG] User created with ID: {user_id}")
        
        access_token = create_access_token(identity=user_id)
        
        return jsonify({
            'access_token': access_token,
            'user': {'id': user_id, 'name': data['name'], 'email': data['email']}
        })
    except Exception as e:
        print(f"[DEBUG] ❌ Registration error: {e}")
        print(f"[DEBUG] Registration error type: {type(e)}")
        print(f"[DEBUG] Registration error details:")
        traceback.print_exc()
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    print(f"[DEBUG] Login attempt started")
    print(f"[DEBUG] mongo object: {mongo}")
    print(f"[DEBUG] mongo.db: {mongo.db if mongo else 'None'}")
    
    try:
        data = request.json
        print(f"[DEBUG] Login data received: {data.keys() if data else 'None'}")
        
        if not data or not all(k in data for k in ('email', 'password')):
            print(f"[DEBUG] Missing required fields")
            return jsonify({'error': 'Missing required fields'}), 400
        
        print(f"[DEBUG] Attempting to find user...")
        if mongo is None or mongo.db is None:
            print(f"[DEBUG] ❌ No MongoDB connection available")
            return jsonify({'error': 'Database connection unavailable'}), 500
            
        user = mongo.db.users.find_one({'email': data['email']})
        print(f"[DEBUG] User found: {user is not None}")
        
        if not user or not check_password_hash(user['password'], data['password']):
            print(f"[DEBUG] Invalid credentials")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        access_token = create_access_token(identity=str(user['_id']))
        print(f"[DEBUG] Login successful for user: {user['_id']}")
        
        return jsonify({
            'access_token': access_token,
            'user': {'id': str(user['_id']), 'name': user['name'], 'email': user['email']}
        })
    except Exception as e:
        print(f"[DEBUG] ❌ Login error: {e}")
        print(f"[DEBUG] Login error type: {type(e)}")
        print(f"[DEBUG] Login error details:")
        traceback.print_exc()
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    try:
        user_id = get_jwt_identity()
        user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'id': str(user['_id']),
            'name': user['name'],
            'email': user['email']
        })
    except Exception as e:
        print(f"Get current user error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get user'}), 500

# Import and register blueprints
try:
    from routes.meetings import meetings_bp
    from routes.recording import recording_bp  
    from routes.transcription import transcription_bp
    from routes.summary import summary_bp
    from routes.knowledge_graph import knowledge_graph_bp
    from routes.chatbot import chatbot_bp
    from routes.report import report_bp
    from routes.webrtc import webrtc_bp
    from routes.minutes import minutes_bp
    from routes.insights import insights_bp
    from routes.settings import settings_bp
    
    app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
    app.register_blueprint(recording_bp, url_prefix='/api/recording')
    app.register_blueprint(transcription_bp, url_prefix='/api/transcription')
    app.register_blueprint(summary_bp, url_prefix='/api/summary')
    app.register_blueprint(knowledge_graph_bp, url_prefix='/api/knowledge-graph')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    app.register_blueprint(webrtc_bp, url_prefix='/api/webrtc')
    app.register_blueprint(minutes_bp, url_prefix='/api/minutes')
    app.register_blueprint(insights_bp, url_prefix='/api/insights')
    app.register_blueprint(settings_bp, url_prefix='/api/settings')
    
    print(f"[DEBUG] ✅ All blueprints registered successfully")
    
except ImportError as e:
    print(f"[DEBUG] ⚠️ Warning: Could not import some routes: {e}")
    traceback.print_exc()

@app.route('/api/health', methods=['GET'])
def health_check():
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'mongo_connected': bool(mongo and mongo.db),
        'environment': 'production' if IS_PRODUCTION else 'development'
    }
    
    if mongo and mongo.db:
        try:
            # Test database connection
            mongo.cx.server_info()
            health_status['database'] = 'connected'
        except Exception as e:
            health_status['database'] = f'error: {str(e)}'
    else:
        health_status['database'] = 'not_initialized'
    
    return jsonify(health_status)

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'message': 'Huddle API is running', 
        'status': 'healthy',
        'mongo_status': 'connected' if (mongo and mongo.db) else 'disconnected'
    })

if __name__ == "__main__":
    print("Starting Huddle backend with Socket.IO support...")
    print(f"[DEBUG] Final startup check - mongo: {mongo}, mongo.db: {mongo.db if mongo else 'None'}")
    
    port = int(os.getenv('PORT', 5000))
    
    if IS_PRODUCTION:
        print(f"[DEBUG] Starting in PRODUCTION mode on port {port}")
        # Production configuration
        socketio.run(app, 
                    host='0.0.0.0', 
                    port=port,
                    debug=False,
                    allow_unsafe_werkzeug=True)
    else:
        print(f"[DEBUG] Starting in DEVELOPMENT mode on port {port}")
        # Development configuration
        socketio.run(app, 
                    debug=True, 
                    host='0.0.0.0', 
                    port=port,
                    allow_unsafe_werkzeug=True)