"""
Settings API — AI mode management, local model management, provider status
"""

from flask import Blueprint, request, jsonify, current_app, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai_router import get_user_mode, set_user_mode, get_user_local_model, set_user_local_model, get_provider_info
from utils.local_llm import (
    is_ollama_available,
    get_available_models,
    pull_model,
    pull_model_stream,
    delete_model,
    get_model_info
)
import json

settings_bp = Blueprint('settings', __name__)


# ─── Recommended models for users to download ───────────────────────
RECOMMENDED_MODELS = [
    {
        "name": "llama3.2",
        "display_name": "Llama 3.2 (3B)",
        "size": "2.0 GB",
        "description": "Meta's latest compact model. Great balance of speed and quality for meeting analysis.",
        "category": "recommended",
        "parameters": "3B"
    },
    {
        "name": "llama3.2:1b",
        "display_name": "Llama 3.2 (1B)",
        "size": "1.3 GB",
        "description": "Ultra-lightweight model for fast responses. Best for simple queries and quick summaries.",
        "category": "lightweight",
        "parameters": "1B"
    },
    {
        "name": "mistral",
        "display_name": "Mistral (7B)",
        "size": "4.1 GB",
        "description": "Excellent general-purpose model with strong reasoning capabilities.",
        "category": "recommended",
        "parameters": "7B"
    },
    {
        "name": "phi3:mini",
        "display_name": "Phi-3 Mini (3.8B)",
        "size": "2.3 GB",
        "description": "Microsoft's efficient model. Strong at structured output (JSON) and analysis.",
        "category": "recommended",
        "parameters": "3.8B"
    },
    {
        "name": "gemma2:2b",
        "display_name": "Gemma 2 (2B)",
        "size": "1.6 GB",
        "description": "Google's lightweight open model. Good for quick tasks and privacy-focused use.",
        "category": "lightweight",
        "parameters": "2B"
    },
    {
        "name": "gemma2",
        "display_name": "Gemma 2 (9B)",
        "size": "5.5 GB",
        "description": "Google's larger open model. Higher quality output but requires more RAM.",
        "category": "performance",
        "parameters": "9B"
    },
    {
        "name": "qwen2.5:3b",
        "display_name": "Qwen 2.5 (3B)",
        "size": "1.9 GB",
        "description": "Alibaba's multilingual model. Excellent for multi-language meeting transcripts.",
        "category": "multilingual",
        "parameters": "3B"
    },
    {
        "name": "nomic-embed-text",
        "display_name": "Nomic Embed Text",
        "size": "274 MB",
        "description": "Embedding model for vector search. Required for chatbot Q&A in local mode.",
        "category": "embeddings",
        "parameters": "137M"
    }
]


@settings_bp.route('/ai-mode', methods=['GET'])
@jwt_required()
def get_ai_mode():
    """Get current AI mode for the authenticated user"""
    user_id = get_jwt_identity()
    db = current_app.mongo.db
    
    mode = get_user_mode(user_id, db)
    local_model = get_user_local_model(user_id, db)
    
    return jsonify({
        "mode": mode,
        "local_model": local_model,
        "available_modes": [
            {
                "id": "off-device",
                "name": "Off-Device (Cloud)",
                "description": "Uses Google Gemini API. Best quality, requires internet. Data is sent to Google servers.",
                "icon": "cloud",
                "status": "available"
            },
            {
                "id": "local",
                "name": "Local (On-Device)",
                "description": "Runs AI models locally via Ollama. Privacy-focused, no data leaves your machine. Requires Ollama installed.",
                "icon": "shield",
                "status": "available"
            },
            {
                "id": "hybrid",
                "name": "Hybrid (Smart Routing)",
                "description": "Automatically routes simple queries to local model for speed & privacy, complex queries to cloud for quality.",
                "icon": "zap",
                "status": "wip"
            }
        ]
    })


@settings_bp.route('/ai-mode', methods=['POST'])
@jwt_required()
def set_ai_mode():
    """Set AI mode for the authenticated user"""
    user_id = get_jwt_identity()
    db = current_app.mongo.db
    data = request.get_json()
    
    mode = data.get('mode') if data else None
    if not mode:
        return jsonify({"error": "Mode is required"}), 400
    
    valid_modes = ["local", "off-device", "hybrid"]
    if mode not in valid_modes:
        return jsonify({"error": f"Invalid mode. Must be one of: {valid_modes}"}), 400
    
    # For local mode, check if Ollama is available
    if mode == "local":
        if not is_ollama_available():
            return jsonify({
                "error": "Ollama is not running. Please install and start Ollama first.",
                "help": "Install from https://ollama.ai, then run 'ollama serve' in terminal."
            }), 400
        
        # Check if at least one model is available
        models = get_available_models()
        if not models:
            return jsonify({
                "warning": "No local models installed. Please download at least one model.",
                "mode_set": True,
                "mode": mode
            })
    
    # For hybrid mode, warn it's WIP
    if mode == "hybrid":
        set_user_mode(user_id, mode, db)
        return jsonify({
            "mode": mode,
            "warning": "Hybrid mode is currently Work In Progress. It will analyze query complexity and route to local or cloud model accordingly.",
            "mode_set": True
        })
    
    set_user_mode(user_id, mode, db)
    return jsonify({"mode": mode, "mode_set": True})


@settings_bp.route('/local-model', methods=['POST'])
@jwt_required()
def set_local_model():
    """Set preferred local model for the authenticated user"""
    user_id = get_jwt_identity()
    db = current_app.mongo.db
    data = request.get_json()
    
    model_name = data.get('model') if data else None
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400
    
    set_user_local_model(user_id, model_name, db)
    return jsonify({"model": model_name, "model_set": True})


@settings_bp.route('/provider-info', methods=['GET'])
@jwt_required()
def get_provider_status():
    """Get comprehensive provider status info"""
    user_id = get_jwt_identity()
    db = current_app.mongo.db
    
    info = get_provider_info(user_id, db)
    return jsonify(info)


# ─── Local Model Management ────────────────────────────────────────

@settings_bp.route('/ollama/status', methods=['GET'])
@jwt_required()
def ollama_status():
    """Check if Ollama is running"""
    available = is_ollama_available()
    return jsonify({
        "available": available,
        "message": "Ollama is running" if available else "Ollama is not running. Start it with 'ollama serve'."
    })


@settings_bp.route('/ollama/models', methods=['GET'])
@jwt_required()
def list_local_models():
    """List locally installed Ollama models"""
    if not is_ollama_available():
        return jsonify({
            "error": "Ollama is not running",
            "models": [],
            "available": False
        })
    
    models = get_available_models()
    
    # Enrich with display info from recommended list
    enriched = []
    for model in models:
        model_name = model.get("name", "")
        # Find in recommended list
        rec = next((r for r in RECOMMENDED_MODELS if r["name"] == model_name or model_name.startswith(r["name"])), None)
        
        enriched.append({
            "name": model_name,
            "display_name": rec["display_name"] if rec else model_name,
            "size": model.get("size", "Unknown"),
            "modified_at": model.get("modified_at", ""),
            "description": rec["description"] if rec else "Custom model",
            "category": rec["category"] if rec else "custom",
            "parameters": rec["parameters"] if rec else "Unknown"
        })
    
    return jsonify({
        "models": enriched,
        "available": True
    })


@settings_bp.route('/ollama/models/recommended', methods=['GET'])
@jwt_required()
def list_recommended_models():
    """List recommended models for download"""
    installed = []
    if is_ollama_available():
        installed_models = get_available_models()
        installed = [m.get("name", "") for m in installed_models]
    
    # Mark which are already installed
    models = []
    for rec in RECOMMENDED_MODELS:
        model = dict(rec)
        model["installed"] = any(
            rec["name"] == inst or inst.startswith(rec["name"] + ":")
            for inst in installed
        )
        models.append(model)
    
    return jsonify({"models": models})


@settings_bp.route('/ollama/models/pull', methods=['POST'])
@jwt_required()
def pull_local_model():
    """Download/pull a model via Ollama"""
    if not is_ollama_available():
        return jsonify({"error": "Ollama is not running"}), 400
    
    data = request.get_json()
    model_name = data.get('model') if data else None
    
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400
    
    # Check if streaming is requested
    stream = data.get('stream', False)
    
    if stream:
        def generate():
            for progress in pull_model_stream(model_name):
                yield f"data: {json.dumps(progress)}\n\n"
            yield f"data: {json.dumps({'status': 'complete'})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
    else:
        success = pull_model(model_name)
        if success:
            return jsonify({"status": "downloaded", "model": model_name})
        else:
            return jsonify({"error": f"Failed to download model '{model_name}'"}), 500


@settings_bp.route('/ollama/models/delete', methods=['DELETE'])
@jwt_required()
def delete_local_model():
    """Delete a locally installed model"""
    if not is_ollama_available():
        return jsonify({"error": "Ollama is not running"}), 400
    
    data = request.get_json()
    model_name = data.get('model') if data else None
    
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400
    
    success = delete_model(model_name)
    if success:
        return jsonify({"status": "deleted", "model": model_name})
    else:
        return jsonify({"error": f"Failed to delete model '{model_name}'"}), 500


@settings_bp.route('/ollama/models/<model_name>/info', methods=['GET'])
@jwt_required()
def model_info(model_name):
    """Get detailed info about a specific model"""
    if not is_ollama_available():
        return jsonify({"error": "Ollama is not running"}), 400
    
    info = get_model_info(model_name)
    if info:
        return jsonify(info)
    else:
        return jsonify({"error": f"Model '{model_name}' not found"}), 404
