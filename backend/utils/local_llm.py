"""
Local LLM Service — Ollama-powered local inference
Mirrors the same functions as ai.py but runs entirely on-device.
Privacy-focused, no data leaves the machine.
"""

import os
import json
import requests
from typing import List, Optional
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
import numpy as np

# Ollama configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("LOCAL_LLM_MODEL", "llama3.2")
DEFAULT_EMBED_MODEL = os.getenv("LOCAL_EMBED_MODEL", "nomic-embed-text")

# Constants (same as ai.py)
MAX_CONTEXT_SIZE = 30000
CHUNK_SIZE = 4096
CHUNK_OVERLAP = 512


def is_ollama_available():
    """Check if Ollama is running and accessible"""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def get_available_models():
    """List locally available Ollama models"""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("models", [])
        return []
    except Exception as e:
        print(f"[LOCAL_LLM] Error listing models: {e}")
        return []


def pull_model(model_name: str):
    """Pull/download a model via Ollama"""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/pull",
            json={"name": model_name, "stream": False},
            timeout=600  # 10 min timeout for large models
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"[LOCAL_LLM] Error pulling model {model_name}: {e}")
        return False


def pull_model_stream(model_name: str):
    """Pull/download a model via Ollama with streaming progress"""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/pull",
            json={"name": model_name, "stream": True},
            stream=True,
            timeout=600
        )
        for line in resp.iter_lines():
            if line:
                yield json.loads(line.decode('utf-8'))
    except Exception as e:
        print(f"[LOCAL_LLM] Error pulling model {model_name}: {e}")
        yield {"error": str(e)}


def delete_model(model_name: str):
    """Delete a locally downloaded model"""
    try:
        resp = requests.delete(
            f"{OLLAMA_BASE_URL}/api/delete",
            json={"name": model_name},
            timeout=30
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"[LOCAL_LLM] Error deleting model {model_name}: {e}")
        return False


def get_model_info(model_name: str):
    """Get detailed info about a model"""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/show",
            json={"name": model_name},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        print(f"[LOCAL_LLM] Error getting model info: {e}")
        return None


def _generate(prompt: str, model: str = None, temperature: float = 0.7, max_tokens: int = 4096) -> str:
    """Core generation function using Ollama API"""
    model = model or DEFAULT_MODEL
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            },
            timeout=300  # 5 min timeout for generation
        )
        
        if resp.status_code == 200:
            return resp.json().get("response", "")
        else:
            print(f"[LOCAL_LLM] Generation error: {resp.status_code} - {resp.text}")
            return f"Error generating response: {resp.status_code}"
    except requests.exceptions.ConnectionError:
        return "Error: Ollama is not running. Please start Ollama first (run 'ollama serve' in terminal)."
    except Exception as e:
        print(f"[LOCAL_LLM] Generation error: {e}")
        return f"Error generating response: {str(e)}"


def _embed(text: str, model: str = None) -> List[float]:
    """Generate embeddings using Ollama"""
    model = model or DEFAULT_EMBED_MODEL
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": model, "prompt": text},
            timeout=60
        )
        if resp.status_code == 200:
            return resp.json().get("embedding", [])
        return []
    except Exception as e:
        print(f"[LOCAL_LLM] Embedding error: {e}")
        return []


# Custom embeddings class for FAISS compatibility
class OllamaEmbeddings:
    """Ollama-based embeddings for use with LangChain/FAISS"""
    
    def __init__(self, model: str = None):
        self.model = model or DEFAULT_EMBED_MODEL
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a list of documents"""
        if isinstance(texts, str):
            texts = [texts]
        embeddings = []
        for text in texts:
            emb = _embed(text, self.model)
            if emb:
                embeddings.append(emb)
            else:
                # Fallback: zero vector (will get replaced when model is available)
                embeddings.append([0.0] * 768)
        return embeddings
    
    def embed_query(self, text: str) -> List[float]:
        """Embed a single query"""
        emb = _embed(text, self.model)
        return emb if emb else [0.0] * 768


# Initialize local embeddings
local_embeddings = OllamaEmbeddings()


def should_chunk_transcript(text):
    """Determine if transcript needs chunking based on size"""
    return len(text) > MAX_CONTEXT_SIZE


def chunk_transcript(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Only chunk if text is too large"""
    if not should_chunk_transcript(text):
        return [text]
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    return splitter.split_text(text)


def create_vector_store(meeting_id: str, transcript: str):
    """Create vector store using local embeddings"""
    try:
        chunks = chunk_transcript(transcript)
        os.makedirs("vector_stores_local", exist_ok=True)
        
        vector_store = FAISS.from_texts(
            chunks,
            local_embeddings,
            metadatas=[{"meeting_id": meeting_id, "chunk_id": i} for i in range(len(chunks))]
        )
        vector_store.save_local(f"vector_stores_local/{meeting_id}")
        print(f"[LOCAL_LLM] Vector store created for meeting {meeting_id}")
        return vector_store
    except Exception as e:
        print(f"[LOCAL_LLM] Error creating vector store: {e}")
        raise e


def load_vector_store(meeting_id: str):
    """Load existing local vector store"""
    try:
        vector_store = FAISS.load_local(
            f"vector_stores_local/{meeting_id}",
            local_embeddings,
            allow_dangerous_deserialization=True
        )
        print(f"[LOCAL_LLM] Vector store loaded for meeting {meeting_id}")
        return vector_store
    except Exception as e:
        print(f"[LOCAL_LLM] Could not load vector store for {meeting_id}: {e}")
        return None


def generate_simple_chat_response(question, transcript, model=None):
    """Generate a chat response using local LLM"""
    prompt = f"""You are an AI assistant helping users understand their meeting content. 

Meeting Transcript:
{transcript}

User Question: {question}

Instructions:
- Answer based only on the provided meeting transcript
- Be specific and helpful
- If the answer isn't in the transcript, say so clearly
- Keep responses concise but informative
- Use a friendly, professional tone

Answer:"""
    
    response = _generate(prompt, model=model)
    return response if response else "I'm having trouble processing your question right now. Please try again."


def generate_summary(transcript, model=None):
    """Generate meeting summary in structured JSON format using local LLM"""
    if not should_chunk_transcript(transcript):
        prompt = f"""Analyze this meeting transcript and provide a comprehensive summary in valid JSON format.

Transcript: {transcript}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{{
    "executive_summary": "2-3 sentence overview of the meeting",
    "key_points": [
        {{"point": "First key discussion point", "importance": "high"}},
        {{"point": "Second key discussion point", "importance": "medium"}}
    ],
    "decisions": [
        {{"decision": "Decision made", "context": "Why this decision was made"}}
    ],
    "action_items": [
        {{"task": "Action item description", "owner": "Person responsible", "deadline": "Timeframe or date", "priority": "high"}}
    ],
    "next_steps": [
        "First next step",
        "Second next step"
    ],
    "key_quotes": [
        {{"quote": "Important statement from meeting", "speaker": "Speaker name or role"}}
    ],
    "metrics": {{
        "total_topics": 5,
        "decisions_made": 3,
        "action_items": 4
    }}
}}"""
        return _generate(prompt, model=model)
    
    # Handle large transcripts with chunking
    chunks = chunk_transcript(transcript)
    summaries = []
    
    for i, chunk in enumerate(chunks):
        prompt = f"""Analyze this meeting transcript chunk and extract key information in JSON:
        
        Transcript chunk: {chunk}
        
        Return valid JSON with: key_points, decisions, action_items"""
        summaries.append(_generate(prompt, model=model))
    
    # Combine summaries
    final_prompt = f"""Combine these chunk summaries into a final structured summary in valid JSON format:
    
    {chr(10).join(summaries)}
    
    Return the same JSON structure as specified earlier."""
    return _generate(final_prompt, model=model)


def chatbot_answer(meeting_id: str, question: str, model=None):
    """Answer questions using vector similarity search for large transcripts"""
    try:
        vector_store = load_vector_store(meeting_id)
        
        if not vector_store:
            return "Vector store not found. Please process the meeting first."
        
        relevant_docs = vector_store.similarity_search(question, k=5)
        context = "\n".join([doc.page_content for doc in relevant_docs])
        
        prompt = f"""You are an AI meeting assistant. Based on the following meeting context, answer the user's question accurately and concisely.

Context from meeting:
{context}

Question: {question}

Instructions:
- Answer based only on the provided context
- If the answer is not in the context, say "I don't have enough information in the meeting transcript to answer that question."
- Be specific and cite relevant parts of the meeting
- Include timestamps or speaker information if available
- Keep answers concise but informative"""

        return _generate(prompt, model=model)
    except Exception as e:
        print(f"[LOCAL_LLM] Chatbot answer error: {e}")
        return "I'm having trouble processing your question right now. Please try again."


def generate_knowledge_graph(transcript, model=None):
    """Generate knowledge graph from meeting transcript using local LLM"""
    if should_chunk_transcript(transcript):
        chunks = chunk_transcript(transcript)
        all_entities = []
        all_relationships = []
        
        for chunk in chunks:
            chunk_graph = _extract_entities_from_chunk(chunk, model)
            if chunk_graph and 'nodes' in chunk_graph:
                all_entities.extend(chunk_graph['nodes'])
            if chunk_graph and 'edges' in chunk_graph:
                all_relationships.extend(chunk_graph['edges'])
        
        unique_entities = _deduplicate_entities(all_entities)
        unique_relationships = _deduplicate_relationships(all_relationships)
        
        return {
            "nodes": unique_entities,
            "edges": unique_relationships,
            "topics": _extract_topics_from_entities(unique_entities),
            "action_items": _extract_action_items(transcript)
        }
    else:
        return _extract_entities_from_chunk(transcript, model)


def _extract_entities_from_chunk(text, model=None):
    """Extract entities from a single chunk using local LLM"""
    prompt = f"""Analyze this meeting transcript and extract a knowledge graph in JSON format.

Text: {text}

Extract entities and relationships. Focus on:
1. People mentioned
2. Projects, products, or initiatives
3. Companies, organizations, or departments
4. Key concepts, topics, or technologies
5. Action items and tasks
6. Decisions made

Return ONLY valid JSON in this exact format:
{{
    "nodes": [
        {{"id": "person_john", "label": "John", "type": "person", "properties": {{"role": "manager"}}}},
        {{"id": "project_alpha", "label": "Project Alpha", "type": "project", "properties": {{"status": "active"}}}}
    ],
    "edges": [
        {{"source": "person_john", "target": "project_alpha", "relationship": "manages", "weight": 1.0}}
    ],
    "topics": ["project management", "code review"],
    "action_items": [
        {{"task": "Complete review", "assignee": "John", "due_date": "next week", "priority": "high"}}
    ]
}}"""
    
    try:
        response = _generate(prompt, model=model)
        json_text = response.strip()
        
        if json_text.startswith('```json'):
            json_text = json_text[7:]
        elif json_text.startswith('```'):
            json_text = json_text[3:]
        if json_text.endswith('```'):
            json_text = json_text[:-3]
        
        result = json.loads(json_text)
        
        if not isinstance(result, dict):
            return _create_fallback_graph(text)
        
        result.setdefault('nodes', [])
        result.setdefault('edges', [])
        result.setdefault('topics', [])
        result.setdefault('action_items', [])
        
        return result
    except Exception as e:
        print(f"[LOCAL_LLM] Knowledge graph extraction error: {e}")
        return _create_fallback_graph(text)


def _create_fallback_graph(text):
    """Create a simple fallback graph when parsing fails"""
    words = text.split()
    people_indicators = ['said', 'mentioned', 'asked', 'replied', 'stated', 'Speaker']
    projects_indicators = ['project', 'initiative', 'product', 'system', 'platform']
    
    nodes = []
    edges = []
    topics = []
    
    if any(indicator in text.lower() for indicator in people_indicators):
        nodes.append({
            "id": "generic_participant",
            "label": "Meeting Participant",
            "type": "person",
            "properties": {"role": "participant"}
        })
    
    if any(indicator in text.lower() for indicator in projects_indicators):
        nodes.append({
            "id": "generic_project",
            "label": "Discussed Project",
            "type": "project",
            "properties": {"status": "mentioned"}
        })
    
    common_topics = ['meeting', 'discussion', 'project', 'team', 'work', 'plan']
    for topic in common_topics:
        if topic in text.lower():
            topics.append(topic)
    
    return {
        "nodes": nodes,
        "edges": edges,
        "topics": topics[:5],
        "action_items": []
    }


def _deduplicate_entities(entities):
    if not entities:
        return []
    unique = []
    seen = set()
    for entity in entities:
        label = entity.get('label', '').lower()
        if label not in seen:
            unique.append(entity)
            seen.add(label)
    return unique


def _deduplicate_relationships(relationships):
    if not relationships:
        return []
    unique = []
    seen = set()
    for rel in relationships:
        key = (rel.get('source'), rel.get('target'), rel.get('relationship'))
        if key not in seen:
            unique.append(rel)
            seen.add(key)
    return unique


def _extract_topics_from_entities(entities):
    topics = []
    for entity in entities:
        if entity.get('type') == 'topic':
            topics.append(entity.get('label', '').lower())
    return list(set(topics))[:10]


def _extract_action_items(transcript):
    action_keywords = ['action item', 'todo', 'follow up', 'assign', 'due', 'deadline']
    lines = transcript.split('\n')
    items = []
    for line in lines:
        if any(keyword in line.lower() for keyword in action_keywords):
            items.append({
                "task": line.strip(),
                "assignee": "TBD",
                "due_date": "TBD",
                "priority": "medium"
            })
    return items[:5]


def translate_transcript(transcript, target_language, model=None):
    """Translate transcript using local LLM"""
    if should_chunk_transcript(transcript):
        chunks = chunk_transcript(transcript)
        translated = []
        for chunk in chunks:
            prompt = f"Translate this meeting transcript to {target_language}:\n\n{chunk}"
            translated.append(_generate(prompt, model=model))
        return '\n\n'.join(translated)
    else:
        prompt = f"Translate this meeting transcript to {target_language}:\n\n{transcript}"
        return _generate(prompt, model=model)


def generate_meeting_insights(transcript, model=None):
    """Generate meeting insights using local LLM"""
    if not should_chunk_transcript(transcript):
        prompt = f"""Analyze this meeting transcript and provide actionable insights in valid JSON format.

Transcript: {transcript}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{{
    "overview": {{
        "meeting_effectiveness_score": 8,
        "overall_sentiment": "positive",
        "engagement_level": "high",
        "summary": "Brief overview of meeting effectiveness"
    }},
    "key_themes": [
        {{"theme": "Theme name", "frequency": 5, "importance": "high", "description": "What this theme covers"}}
    ],
    "participation_analysis": {{
        "most_active_speakers": [
            {{"name": "Speaker name", "contribution_percentage": 35, "engagement": "high"}}
        ],
        "speaking_distribution": "balanced",
        "quiet_participants": ["Name1"]
    }},
    "sentiment_analysis": {{
        "overall_tone": "positive",
        "positive_moments": [
            {{"moment": "Description of positive moment", "timestamp": "approximate time"}}
        ],
        "concerns_raised": [
            {{"concern": "Concern description", "severity": "medium"}}
        ],
        "agreements": ["Agreement 1"],
        "conflicts": []
    }},
    "follow_up_recommendations": [
        {{"recommendation": "What should be done", "priority": "high", "rationale": "Why this is important"}}
    ],
    "risks_and_concerns": [
        {{"risk": "Risk description", "impact": "high", "mitigation": "Suggested mitigation strategy"}}
    ],
    "interesting_observations": [
        "Notable observation 1"
    ],
    "key_metrics": {{
        "topics_discussed": 8,
        "decisions_velocity": "high",
        "action_items_clarity": "clear",
        "time_management": "excellent"
    }}
}}"""
        return _generate(prompt, model=model)
    
    # Handle large transcripts
    chunks = chunk_transcript(transcript)
    insights_list = []
    for chunk in chunks:
        prompt = f"""Analyze this chunk and extract insights in JSON format:
        
        Transcript chunk: {chunk}"""
        insights_list.append(_generate(prompt, model=model))
    
    final_prompt = f"""Combine these insights into final structured JSON:
    
    {chr(10).join(insights_list)}
    
    Return the same JSON structure as specified earlier."""
    return _generate(final_prompt, model=model)


def generate_minutes_of_meeting(transcript, model=None):
    """Generate Minutes of Meeting using local LLM"""
    if not should_chunk_transcript(transcript):
        prompt = f"""Analyze the meeting transcript and generate Minutes of Meeting in valid JSON format.

Transcript: {transcript}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{{
    "meeting_info": {{
        "title": "Suggested meeting title",
        "date": "Inferred or today's date",
        "time": "Meeting time if available",
        "duration": "Estimated duration",
        "location": "Physical or virtual location if mentioned"
    }},
    "attendees": [
        {{"name": "Participant name", "role": "Their role if mentioned", "present": true}}
    ],
    "agenda_items": [
        {{"item": "Agenda topic", "duration": "Time spent", "presenter": "Who led this topic"}}
    ],
    "discussion_points": [
        {{
            "topic": "Discussion topic",
            "summary": "What was discussed",
            "key_points": ["Point 1", "Point 2"],
            "presenter": "Who presented"
        }}
    ],
    "decisions": [
        {{
            "decision": "Decision made",
            "rationale": "Why this decision was made",
            "decision_maker": "Who made the decision",
            "affected_parties": ["Party 1"]
        }}
    ],
    "action_items": [
        {{
            "task": "Task description",
            "assignee": "Person responsible",
            "deadline": "Due date or timeframe",
            "priority": "high",
            "status": "pending",
            "dependencies": []
        }}
    ],
    "parking_lot": [
        "Items tabled for future discussion"
    ],
    "next_meeting": {{
        "scheduled": true,
        "date": "Next meeting date if mentioned",
        "agenda": "Planned topics for next meeting"
    }}
}}"""
        return _generate(prompt, model=model)
    
    # Handle large transcripts
    chunks = chunk_transcript(transcript)
    chunk_minutes = []
    for chunk in chunks:
        prompt = f"""Extract meeting minutes data from this chunk in JSON format:
        
        Transcript chunk: {chunk}"""
        chunk_minutes.append(_generate(prompt, model=model))
    
    final_prompt = f"""Combine these chunks into final Minutes of Meeting in JSON:
    
    {chr(10).join(chunk_minutes)}
    
    Return the same JSON structure as specified earlier."""
    return _generate(final_prompt, model=model)
