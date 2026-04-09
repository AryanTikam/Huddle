import argparse
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
import google.generativeai as genai
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

# Ensure backend root is importable when this script is run directly.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import utils.local_llm as local_provider


def _normalize_qdrant_url(url: str) -> str:
    clean = (url or "").strip()
    if not clean:
        return ""
    if re.match(r"^https?://", clean):
        return clean
    return f"http://{clean}"


def chemistry_knowledge_docs() -> List[Dict[str, Any]]:
    return [
        {
            "topic": "Periodic Trends",
            "subtopic": "Ionization Energy",
            "difficulty": "intro",
            "text": "Ionization energy generally increases across a period and decreases down a group because effective nuclear charge and atomic radius change predictably.",
        },
        {
            "topic": "Periodic Trends",
            "subtopic": "Atomic Radius",
            "difficulty": "intro",
            "text": "Atomic radius decreases left-to-right across a period due to increasing effective nuclear charge and increases down a group because additional electron shells are added.",
        },
        {
            "topic": "Chemical Bonding",
            "subtopic": "Electronegativity",
            "difficulty": "intro",
            "text": "Large electronegativity differences favor ionic character, while small differences favor covalent bonding; bond polarity influences intermolecular forces and reactivity.",
        },
        {
            "topic": "Chemical Bonding",
            "subtopic": "VSEPR",
            "difficulty": "intermediate",
            "text": "VSEPR predicts molecular geometry by minimizing repulsions among electron domains, distinguishing between electron-domain geometry and molecular shape.",
        },
        {
            "topic": "Thermodynamics",
            "subtopic": "Gibbs Free Energy",
            "difficulty": "intermediate",
            "text": "Spontaneity at constant temperature and pressure is determined by Gibbs free energy: delta G = delta H - T delta S. Processes are spontaneous when delta G is negative.",
        },
        {
            "topic": "Thermodynamics",
            "subtopic": "Hess Law",
            "difficulty": "intermediate",
            "text": "Hess's law states that enthalpy is a state function, so the enthalpy change of an overall reaction equals the sum of enthalpy changes of individual steps.",
        },
        {
            "topic": "Kinetics",
            "subtopic": "Rate Law",
            "difficulty": "intermediate",
            "text": "Reaction orders are determined experimentally; the rate law may differ from stoichiometric coefficients and reveals dependence on reactant concentrations.",
        },
        {
            "topic": "Kinetics",
            "subtopic": "Arrhenius Equation",
            "difficulty": "intermediate",
            "text": "The Arrhenius equation, k = A e^(-Ea/RT), shows that reaction rate constants increase with temperature and decrease with higher activation energy.",
        },
        {
            "topic": "Equilibrium",
            "subtopic": "Le Chatelier Principle",
            "difficulty": "intro",
            "text": "When a system at equilibrium experiences stress in concentration, pressure, or temperature, it shifts in the direction that partially counteracts the disturbance.",
        },
        {
            "topic": "Equilibrium",
            "subtopic": "Kc and Q",
            "difficulty": "intermediate",
            "text": "The reaction quotient Q has the same form as K. If Q < K, the system proceeds forward; if Q > K, it proceeds in reverse until equilibrium is reestablished.",
        },
        {
            "topic": "Acid-Base",
            "subtopic": "Bronsted Lowry",
            "difficulty": "intro",
            "text": "Bronsted-Lowry acids donate protons and bases accept protons. Conjugate acid-base pairs differ by one proton.",
        },
        {
            "topic": "Acid-Base",
            "subtopic": "Buffers",
            "difficulty": "intermediate",
            "text": "Buffers resist pH change because they contain a weak acid/base and its conjugate partner. The Henderson-Hasselbalch equation estimates buffer pH.",
        },
        {
            "topic": "Electrochemistry",
            "subtopic": "Galvanic Cells",
            "difficulty": "intermediate",
            "text": "In galvanic cells, oxidation occurs at the anode and reduction at the cathode. Electrons flow from anode to cathode through the external circuit.",
        },
        {
            "topic": "Electrochemistry",
            "subtopic": "Nernst Equation",
            "difficulty": "advanced",
            "text": "The Nernst equation relates nonstandard cell potential to standard potential and reaction quotient, enabling prediction of voltage under real concentrations.",
        },
        {
            "topic": "Organic Chemistry",
            "subtopic": "SN1 vs SN2",
            "difficulty": "advanced",
            "text": "SN1 reactions proceed via carbocation intermediates and often give racemization, whereas SN2 reactions are concerted and show backside attack with inversion.",
        },
        {
            "topic": "Organic Chemistry",
            "subtopic": "E1 vs E2",
            "difficulty": "advanced",
            "text": "E1 eliminations involve carbocation intermediates and are favored by weak bases in polar protic solvents, while E2 eliminations are concerted and require strong bases.",
        },
        {
            "topic": "Coordination Chemistry",
            "subtopic": "Crystal Field Splitting",
            "difficulty": "advanced",
            "text": "Crystal field splitting in transition-metal complexes explains high-spin versus low-spin configurations, magnetic behavior, and color through d-orbital energy differences.",
        },
        {
            "topic": "Analytical Chemistry",
            "subtopic": "Beer Lambert Law",
            "difficulty": "intermediate",
            "text": "Beer-Lambert law states absorbance is proportional to concentration and path length: A = epsilon l c, enabling quantitative analysis by spectrophotometry.",
        },
        {
            "topic": "Industrial Chemistry",
            "subtopic": "Haber Process",
            "difficulty": "advanced",
            "text": "The Haber process synthesizes ammonia from nitrogen and hydrogen; high pressure and moderate temperature with an iron catalyst balance rate and equilibrium yield.",
        },
        {
            "topic": "Industrial Chemistry",
            "subtopic": "Contact Process",
            "difficulty": "advanced",
            "text": "The Contact process produces sulfuric acid via catalytic oxidation of sulfur dioxide to sulfur trioxide, then absorption and dilution steps for controlled acid formation.",
        },
    ]


class GeminiEmbeddingsCompat:
    """Gemini embeddings with model fallback for deprecated model names."""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        genai.configure(api_key=api_key)

        preferred = os.getenv("GEMINI_EMBED_MODEL", "models/gemini-embedding-001").strip()
        if preferred and not preferred.startswith("models/"):
            preferred = f"models/{preferred}"

        # Keep a fallback list for projects still configured with old model names.
        self.models = [
            preferred,
            "models/gemini-embedding-001",
            "models/gemini-embedding-2-preview",
            "models/text-embedding-004",
            "models/embedding-001",
        ]
        self.models = [m for i, m in enumerate(self.models) if m and m not in self.models[:i]]
        self.working_model = self.models[0]

    def _embed(self, text: str, task_type: str) -> List[float]:
        last_error = None
        for model in self.models:
            try:
                result = genai.embed_content(model=model, content=text, task_type=task_type)
                self.working_model = model
                return result["embedding"]
            except Exception as exc:
                last_error = exc
                if "not found" in str(exc).lower() or "not supported" in str(exc).lower():
                    continue
                raise
        raise RuntimeError(f"No supported Gemini embedding model found. Last error: {last_error}")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if isinstance(texts, str):
            texts = [texts]
        return [self._embed(t, task_type="retrieval_document") for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text, task_type="retrieval_query")


def get_embeddings_provider(mode: str):
    if mode == "local":
        return local_provider.local_embeddings
    return GeminiEmbeddingsCompat()


def build_points(docs: List[Dict[str, Any]], mode: str) -> List[PointStruct]:
    provider = get_embeddings_provider(mode)
    texts = [d["text"] for d in docs]
    vectors = provider.embed_documents(texts)

    if not vectors or not vectors[0]:
        raise RuntimeError("Embedding generation failed; verify model/API configuration.")

    points: List[PointStruct] = []
    for idx, (doc, vector) in enumerate(zip(docs, vectors)):
        deterministic_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"chemistry-{doc['topic']}-{doc['subtopic']}-{idx}"))
        points.append(
            PointStruct(
                id=deterministic_id,
                vector=vector,
                payload={
                    "domain": "chemistry",
                    "topic": doc["topic"],
                    "subtopic": doc["subtopic"],
                    "difficulty": doc["difficulty"],
                    "text": doc["text"],
                    "source": "seed-script",
                },
            )
        )
    return points


def ensure_collection(client: QdrantClient, collection_name: str, vector_size: int, recreate: bool) -> None:
    exists = client.collection_exists(collection_name=collection_name)

    if exists and recreate:
        client.delete_collection(collection_name=collection_name)
        exists = False

    if not exists:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )


def query_top_hits(
    client: QdrantClient,
    collection_name: str,
    query_vector: List[float],
    limit: int = 3,
):
    """Support both legacy search() and newer query_points() APIs."""
    if hasattr(client, "search"):
        return client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )

    response = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )
    return getattr(response, "points", [])


def run_seed(
    qdrant_url: str,
    collection_name: str,
    qdrant_api_key: str,
    mode: str,
    recreate: bool,
    test_query: str,
) -> None:
    docs = chemistry_knowledge_docs()
    points = build_points(docs, mode)

    client = QdrantClient(
        url=_normalize_qdrant_url(qdrant_url),
        api_key=qdrant_api_key or None,
        timeout=20,
        check_compatibility=False,
    )

    vector_size = len(points[0].vector)
    ensure_collection(client, collection_name, vector_size, recreate)

    client.upsert(collection_name=collection_name, points=points, wait=True)

    info = client.get_collection(collection_name=collection_name)
    print(f"[OK] Seeded collection '{collection_name}' with {len(points)} chemistry documents.")
    print(f"[OK] Qdrant points_count: {getattr(info, 'points_count', 'unknown')}")

    if test_query:
        provider = get_embeddings_provider(mode)
        query_vector = provider.embed_query(test_query)
        results = query_top_hits(
            client=client,
            collection_name=collection_name,
            query_vector=query_vector,
            limit=3,
        )

        print("\nTop 3 retrieval hits for test query:")
        print(f"Query: {test_query}")
        for i, hit in enumerate(results, start=1):
            payload = hit.payload or {}
            print(
                f"{i}. score={hit.score:.4f} | {payload.get('topic', 'N/A')} / {payload.get('subtopic', 'N/A')}"
            )
            snippet = (payload.get("text") or "")[:140].strip()
            print(f"   {snippet}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Populate Qdrant with sample chemistry knowledge for RAG testing."
    )
    parser.add_argument(
        "--qdrant-url",
        default=os.getenv("QDRANT_URL", "http://localhost:6333"),
        help="Qdrant URL (default: env QDRANT_URL or http://localhost:6333)",
    )
    parser.add_argument(
        "--qdrant-api-key",
        default=os.getenv("QDRANT_API_KEY", ""),
        help="Qdrant API key (default: env QDRANT_API_KEY)",
    )
    parser.add_argument(
        "--collection",
        default=os.getenv("QDRANT_COLLECTION", "chemistry_knowledge"),
        help="Collection name (default: env QDRANT_COLLECTION or chemistry_knowledge)",
    )
    parser.add_argument(
        "--mode",
        choices=["off-device", "local"],
        default=os.getenv("AI_MODE", "off-device"),
        help="Embedding mode aligned with RAG retrieval path.",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and recreate the collection before inserting sample data.",
    )
    parser.add_argument(
        "--test-query",
        default="How do pressure and temperature influence ammonia yield in the Haber process?",
        help="Run a retrieval smoke test after seeding (set empty string to skip).",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv(BACKEND_ROOT / ".env")
    args = parse_args()

    if not args.qdrant_url:
        raise ValueError("Qdrant URL is required. Pass --qdrant-url or set QDRANT_URL.")

    run_seed(
        qdrant_url=args.qdrant_url,
        collection_name=args.collection,
        qdrant_api_key=args.qdrant_api_key,
        mode=args.mode,
        recreate=args.recreate,
        test_query=args.test_query,
    )


if __name__ == "__main__":
    main()
