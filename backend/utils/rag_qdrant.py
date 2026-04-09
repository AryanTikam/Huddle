import hashlib
import os
import re
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient

import utils.ai as gemini_provider
import utils.local_llm as local_provider

DEFAULT_TOP_K = int(os.getenv("QDRANT_TOP_K", "4"))
MAX_RAG_CONTEXT_CHARS = int(os.getenv("RAG_CONTEXT_MAX_CHARS", "5000"))
MAX_QUERY_CHARS = int(os.getenv("RAG_QUERY_MAX_CHARS", "1200"))


def _extract_expected_vector_size(collection_info: Any) -> Optional[int]:
    """Best-effort extraction of collection vector size across Qdrant client versions."""
    try:
        config = getattr(collection_info, "config", None)
        params = getattr(config, "params", None)
        vectors = getattr(params, "vectors", None)

        if vectors is None:
            return None

        size = getattr(vectors, "size", None)
        if size is not None:
            return int(size)

        if isinstance(vectors, dict):
            for value in vectors.values():
                if isinstance(value, dict) and value.get("size") is not None:
                    return int(value["size"])

                nested_size = getattr(value, "size", None)
                if nested_size is not None:
                    return int(nested_size)

        return None
    except Exception:
        return None


def _candidate_modes(primary_mode: str) -> List[str]:
    """Return preferred embedding modes to try, ordered by closeness to current mode."""
    mode = (primary_mode or "off-device").strip()
    if mode == "local":
        candidates = ["local", "off-device"]
    elif mode == "hybrid":
        # Hybrid currently leans cloud-first for embedding compatibility.
        candidates = ["off-device", "local"]
    else:
        candidates = ["off-device", "local"]

    deduped: List[str] = []
    for item in candidates:
        if item not in deduped:
            deduped.append(item)
    return deduped


def _embed_for_expected_dim(query_text: str, primary_mode: str, expected_dim: Optional[int]):
    """Embed query and pick the first vector matching expected_dim (if provided)."""
    for candidate_mode in _candidate_modes(primary_mode):
        vector = _embed_query_private(query_text, candidate_mode)
        if not vector:
            continue

        if expected_dim is None or len(vector) == expected_dim:
            return vector, candidate_mode

    return [], None


def _normalize_qdrant_url(url: str) -> str:
    """Ensure Qdrant URL has a scheme so client parsing is consistent."""
    clean = (url or "").strip()
    if not clean:
        return ""

    if re.match(r"^https?://", clean):
        return clean

    return f"http://{clean}"


def get_user_rag_config(user_id: str, db, include_secrets: bool = False) -> Optional[Dict[str, Any]]:
    """Fetch per-user RAG configuration from user_settings."""
    if not user_id or db is None:
        return None

    settings = db.user_settings.find_one({"user_id": user_id}) or {}
    rag = settings.get("rag") or {}

    if not rag.get("enabled"):
        return None

    config = {
        "enabled": True,
        "qdrant_url": rag.get("qdrant_url", "").strip(),
        "collection_name": rag.get("collection_name", "").strip(),
        "top_k": int(rag.get("top_k") or DEFAULT_TOP_K),
    }

    if include_secrets:
        config["qdrant_api_key"] = rag.get("qdrant_api_key", "")

    if not config["qdrant_url"] or not config["collection_name"]:
        return None

    return config


def set_user_rag_config(user_id: str, db, config: Dict[str, Any]) -> None:
    """Persist per-user RAG configuration in user_settings."""
    if not user_id:
        raise ValueError("user_id is required")

    qdrant_url = _normalize_qdrant_url(config.get("qdrant_url") or "")
    collection_name = (config.get("collection_name") or "").strip()
    qdrant_api_key = (config.get("qdrant_api_key") or "").strip()
    top_k = int(config.get("top_k") or DEFAULT_TOP_K)
    enabled = bool(config.get("enabled", True))

    if enabled and (not qdrant_url or not collection_name):
        raise ValueError("qdrant_url and collection_name are required when RAG is enabled")

    # Preserve existing API key when caller omits it during updates.
    if not qdrant_api_key:
        existing = db.user_settings.find_one({"user_id": user_id}) or {}
        existing_rag = existing.get("rag") or {}
        qdrant_api_key = (existing_rag.get("qdrant_api_key") or "").strip()

    db.user_settings.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "rag": {
                    "enabled": enabled,
                    "qdrant_url": qdrant_url,
                    "collection_name": collection_name,
                    "qdrant_api_key": qdrant_api_key,
                    "top_k": max(1, min(top_k, 10)),
                },
            }
        },
        upsert=True,
    )


def clear_user_rag_config(user_id: str, db) -> None:
    """Disable and clear per-user RAG configuration."""
    db.user_settings.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "rag": {
                    "enabled": False,
                    "qdrant_url": "",
                    "collection_name": "",
                    "qdrant_api_key": "",
                    "top_k": DEFAULT_TOP_K,
                },
            }
        },
        upsert=True,
    )


def verify_qdrant_connection(config: Dict[str, Any]) -> Dict[str, Any]:
    """Validate that the provided Qdrant config can connect to the collection."""
    client = QdrantClient(
        url=_normalize_qdrant_url(config["qdrant_url"]),
        api_key=config.get("qdrant_api_key") or None,
        timeout=10,
        check_compatibility=False,
    )

    info = client.get_collection(config["collection_name"])
    points_count = getattr(info, "points_count", None)

    return {
        "connected": True,
        "collection_name": config["collection_name"],
        "points_count": points_count,
    }


def _embed_query_private(query_text: str, mode: str) -> List[float]:
    """
    Convert query text to embedding locally/in provider and return only vector.
    Raw query text is never sent to Qdrant.
    """
    safe_query = (query_text or "").strip()[:MAX_QUERY_CHARS]
    if not safe_query:
        return []

    if mode == "local":
        return local_provider.local_embeddings.embed_query(safe_query)

    # For off-device and hybrid fallback, use Gemini embeddings.
    return gemini_provider.embeddings.embed_query(safe_query)


def retrieve_rag_context(
    query_text: str,
    user_id: Optional[str],
    db,
    mode: str = "off-device",
) -> str:
    """
    Retrieve supplemental domain context from Qdrant using blind vector search.

    Privacy behavior:
    - Only the embedding vector is sent to Qdrant.
    - Raw query text is not sent to Qdrant and not logged.
    """
    if not user_id or db is None:
        return ""

    config = get_user_rag_config(user_id, db, include_secrets=True)
    if not config:
        return ""

    try:
        client = QdrantClient(
            url=_normalize_qdrant_url(config["qdrant_url"]),
            api_key=config.get("qdrant_api_key") or None,
            timeout=10,
            check_compatibility=False,
        )

        collection_info = client.get_collection(config["collection_name"])
        expected_dim = _extract_expected_vector_size(collection_info)

        vector, used_mode = _embed_for_expected_dim(query_text, mode, expected_dim)
        if not vector:
            query_fingerprint = hashlib.sha256((query_text or "").encode("utf-8")).hexdigest()[:12]
            print(
                f"[RAG] No compatible embedding vector for fingerprint={query_fingerprint}; "
                f"expected_dim={expected_dim} mode={mode}"
            )
            return ""

        if used_mode and used_mode != mode:
            query_fingerprint = hashlib.sha256((query_text or "").encode("utf-8")).hexdigest()[:12]
            print(
                f"[RAG] Embedding mode fallback for fingerprint={query_fingerprint}: "
                f"requested={mode} used={used_mode} expected_dim={expected_dim}"
            )

        top_k = max(1, min(int(config.get("top_k") or DEFAULT_TOP_K), 10))
        if hasattr(client, "search"):
            results = client.search(
                collection_name=config["collection_name"],
                query_vector=vector,
                limit=top_k,
                with_payload=True,
                with_vectors=False,
            )
        else:
            response = client.query_points(
                collection_name=config["collection_name"],
                query=vector,
                limit=top_k,
                with_payload=True,
                with_vectors=False,
            )
            results = getattr(response, "points", [])

        snippets: List[str] = []
        for point in results:
            payload = point.payload or {}
            text = (
                payload.get("text")
                or payload.get("content")
                or payload.get("chunk")
                or payload.get("document")
                or payload.get("body")
            )

            if text and isinstance(text, str):
                cleaned = text.strip()
                if cleaned:
                    snippets.append(cleaned)

        if not snippets:
            return ""

        unique_snippets = []
        seen = set()
        for item in snippets:
            key = item[:300]
            if key in seen:
                continue
            seen.add(key)
            unique_snippets.append(item)

        joined = "\n\n".join(unique_snippets)
        return joined[:MAX_RAG_CONTEXT_CHARS]

    except Exception as e:
        # Log only query fingerprint, never raw text.
        query_fingerprint = hashlib.sha256((query_text or "").encode("utf-8")).hexdigest()[:12]
        print(f"[RAG] Retrieval failed for fingerprint={query_fingerprint}: {e}")
        return ""
