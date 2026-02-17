"""
AI Router — Dispatches AI calls to local or off-device (Gemini) based on mode setting.

Modes:
  - "off-device": Uses Gemini API (default, current behavior)
  - "local": Uses Ollama for on-device inference (privacy-focused)
  - "hybrid": [WIP] Analyzes complexity and routes accordingly

The mode is stored per-user in MongoDB. Falls back to environment variable AI_MODE,
then defaults to "off-device".
"""

import os
from functools import wraps

# Import both providers
import utils.ai as gemini_provider
import utils.local_llm as local_provider

# Default mode from env, fallback to off-device
DEFAULT_MODE = os.getenv("AI_MODE", "off-device")

# In-memory cache of user mode preferences (refreshed from DB on request)
_user_mode_cache = {}


def get_user_mode(user_id=None, db=None):
    """Get AI mode for a user. Checks DB first, then env, then default."""
    if user_id and db:
        try:
            # Check DB for user preference
            settings = db.user_settings.find_one({"user_id": user_id})
            if settings and settings.get("ai_mode"):
                mode = settings["ai_mode"]
                _user_mode_cache[user_id] = mode
                return mode
        except Exception as e:
            print(f"[AI_ROUTER] Error reading user mode from DB: {e}")
    
    # Check cache
    if user_id and user_id in _user_mode_cache:
        return _user_mode_cache[user_id]
    
    return DEFAULT_MODE


def set_user_mode(user_id, mode, db):
    """Set AI mode for a user in the database."""
    valid_modes = ["local", "off-device", "hybrid"]
    if mode not in valid_modes:
        raise ValueError(f"Invalid mode '{mode}'. Must be one of: {valid_modes}")
    
    db.user_settings.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "ai_mode": mode
        }},
        upsert=True
    )
    _user_mode_cache[user_id] = mode
    return True


def get_user_local_model(user_id=None, db=None):
    """Get the user's preferred local model name."""
    if user_id and db:
        try:
            settings = db.user_settings.find_one({"user_id": user_id})
            if settings and settings.get("local_model"):
                return settings["local_model"]
        except Exception:
            pass
    return local_provider.DEFAULT_MODEL


def set_user_local_model(user_id, model_name, db):
    """Set the user's preferred local model."""
    db.user_settings.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "local_model": model_name
        }},
        upsert=True
    )
    return True


def _estimate_complexity(text):
    """
    [HYBRID MODE - WIP]
    Estimate the complexity of a query/transcript to decide routing.
    Returns a score 0-100. Higher = more complex = should use off-device.
    """
    score = 0
    
    # Length-based complexity
    length = len(text)
    if length > 20000:
        score += 30
    elif length > 10000:
        score += 20
    elif length > 5000:
        score += 10
    
    # Vocabulary complexity (unique words ratio)
    words = text.lower().split()
    if words:
        unique_ratio = len(set(words)) / len(words)
        if unique_ratio > 0.7:
            score += 15
        elif unique_ratio > 0.5:
            score += 10
    
    # Technical indicators
    technical_terms = [
        'algorithm', 'architecture', 'implementation', 'optimization', 
        'infrastructure', 'deployment', 'microservice', 'kubernetes',
        'machine learning', 'neural network', 'regression', 'classification',
        'financial', 'compliance', 'regulatory', 'liability'
    ]
    tech_count = sum(1 for term in technical_terms if term in text.lower())
    score += min(tech_count * 5, 25)
    
    # Multi-language detection (simple heuristic)
    non_ascii = sum(1 for c in text if ord(c) > 127)
    if non_ascii > len(text) * 0.1:
        score += 20
    
    return min(score, 100)


def _should_use_local(text, threshold=40):
    """
    [HYBRID MODE - WIP]
    Decide whether to use local model based on complexity.
    Below threshold -> local (fast, private)
    Above threshold -> off-device (more capable)
    """
    complexity = _estimate_complexity(text)
    print(f"[AI_ROUTER] Hybrid mode complexity score: {complexity}/{threshold}")
    return complexity < threshold


# ─── Routed Functions ──────────────────────────────────────────────

def generate_summary(transcript, user_id=None, db=None):
    """Route summary generation to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] generate_summary | mode={mode}")
    
    if mode == "local":
        model = get_user_local_model(user_id, db)
        return local_provider.generate_summary(transcript, model=model)
    elif mode == "hybrid":
        # WIP: Route based on complexity
        if _should_use_local(transcript):
            model = get_user_local_model(user_id, db)
            print("[AI_ROUTER] Hybrid -> routing to LOCAL")
            return local_provider.generate_summary(transcript, model=model)
        else:
            print("[AI_ROUTER] Hybrid -> routing to OFF-DEVICE (Gemini)")
            return gemini_provider.generate_summary(transcript)
    else:  # off-device
        return gemini_provider.generate_summary(transcript)


def generate_simple_chat_response(question, transcript, user_id=None, db=None):
    """Route chat response to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] generate_simple_chat_response | mode={mode}")
    
    if mode == "local":
        model = get_user_local_model(user_id, db)
        return local_provider.generate_simple_chat_response(question, transcript, model=model)
    elif mode == "hybrid":
        if _should_use_local(question + transcript):
            model = get_user_local_model(user_id, db)
            return local_provider.generate_simple_chat_response(question, transcript, model=model)
        else:
            return gemini_provider.generate_simple_chat_response(question, transcript)
    else:
        return gemini_provider.generate_simple_chat_response(question, transcript)


def chatbot_answer(meeting_id, question, user_id=None, db=None):
    """Route chatbot answer to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] chatbot_answer | mode={mode}")
    
    if mode == "local":
        return local_provider.chatbot_answer(meeting_id, question)
    elif mode == "hybrid":
        if _should_use_local(question):
            return local_provider.chatbot_answer(meeting_id, question)
        else:
            return gemini_provider.chatbot_answer(meeting_id, question)
    else:
        return gemini_provider.chatbot_answer(meeting_id, question)


def create_vector_store(meeting_id, transcript, user_id=None, db=None):
    """Route vector store creation to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] create_vector_store | mode={mode}")
    
    if mode == "local":
        return local_provider.create_vector_store(meeting_id, transcript)
    else:
        return gemini_provider.create_vector_store(meeting_id, transcript)


def load_vector_store(meeting_id, user_id=None, db=None):
    """Route vector store loading to appropriate provider"""
    mode = get_user_mode(user_id, db)
    
    if mode == "local":
        return local_provider.load_vector_store(meeting_id)
    else:
        return gemini_provider.load_vector_store(meeting_id)


def generate_knowledge_graph(transcript, user_id=None, db=None):
    """Route knowledge graph generation to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] generate_knowledge_graph | mode={mode}")
    
    if mode == "local":
        model = get_user_local_model(user_id, db)
        return local_provider.generate_knowledge_graph(transcript, model=model)
    elif mode == "hybrid":
        if _should_use_local(transcript):
            model = get_user_local_model(user_id, db)
            return local_provider.generate_knowledge_graph(transcript, model=model)
        else:
            return gemini_provider.generate_knowledge_graph(transcript)
    else:
        return gemini_provider.generate_knowledge_graph(transcript)


def translate_transcript(transcript, target_language, user_id=None, db=None):
    """Route translation to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] translate_transcript | mode={mode}")
    
    if mode == "local":
        model = get_user_local_model(user_id, db)
        return local_provider.translate_transcript(transcript, target_language, model=model)
    elif mode == "hybrid":
        # Translation is complex, prefer off-device in hybrid mode
        print("[AI_ROUTER] Hybrid -> routing translation to OFF-DEVICE")
        return gemini_provider.translate_transcript(transcript, target_language)
    else:
        return gemini_provider.translate_transcript(transcript, target_language)


def generate_meeting_insights(transcript, user_id=None, db=None):
    """Route insights generation to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] generate_meeting_insights | mode={mode}")
    
    if mode == "local":
        model = get_user_local_model(user_id, db)
        return local_provider.generate_meeting_insights(transcript, model=model)
    elif mode == "hybrid":
        if _should_use_local(transcript):
            model = get_user_local_model(user_id, db)
            return local_provider.generate_meeting_insights(transcript, model=model)
        else:
            return gemini_provider.generate_meeting_insights(transcript)
    else:
        return gemini_provider.generate_meeting_insights(transcript)


def generate_minutes_of_meeting(transcript, user_id=None, db=None):
    """Route minutes generation to appropriate provider"""
    mode = get_user_mode(user_id, db)
    print(f"[AI_ROUTER] generate_minutes_of_meeting | mode={mode}")
    
    if mode == "local":
        model = get_user_local_model(user_id, db)
        return local_provider.generate_minutes_of_meeting(transcript, model=model)
    elif mode == "hybrid":
        if _should_use_local(transcript):
            model = get_user_local_model(user_id, db)
            return local_provider.generate_minutes_of_meeting(transcript, model=model)
        else:
            return gemini_provider.generate_minutes_of_meeting(transcript)
    else:
        return gemini_provider.generate_minutes_of_meeting(transcript)


# ─── Provider Info ──────────────────────────────────────────────────

def get_provider_info(user_id=None, db=None):
    """Get information about the current AI provider configuration"""
    mode = get_user_mode(user_id, db)
    
    info = {
        "mode": mode,
        "provider": "gemini" if mode == "off-device" else ("ollama" if mode == "local" else "hybrid"),
    }
    
    if mode in ("local", "hybrid"):
        info["ollama_available"] = local_provider.is_ollama_available()
        info["local_model"] = get_user_local_model(user_id, db)
        info["available_models"] = local_provider.get_available_models()
    
    if mode in ("off-device", "hybrid"):
        info["gemini_configured"] = bool(os.getenv("GEMINI_API_KEY"))
    
    return info
