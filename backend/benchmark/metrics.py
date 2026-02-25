"""
Metrics calculation for STT benchmark evaluation.
Handles WER, CER, precision, recall, and F1 scores.
"""

import re
from typing import Dict, List, Tuple
from difflib import SequenceMatcher


class STTMetrics:
    """Calculate comprehensive STT performance metrics."""

    @staticmethod
    def normalize_text(text: str) -> str:
        """Normalize text for fair comparison."""
        # Convert to lowercase
        text = text.lower()
        # Remove punctuation
        text = re.sub(r'[.,!?;:\'"()–]', '', text)
        # Collapse multiple spaces
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    @staticmethod
    def character_error_rate(reference: str, hypothesis: str) -> float:
        """
        Calculate Character Error Rate (CER).
        Lower is better (0% = perfect, 100% = completely wrong).
        """
        ref_norm = STTMetrics.normalize_text(reference)
        hyp_norm = STTMetrics.normalize_text(hypothesis)
        
        ref_len = len(ref_norm)
        if ref_len == 0:
            return 0.0 if len(hyp_norm) == 0 else 100.0

        # Levenshtein-like distance
        distance = STTMetrics._levenshtein_distance(ref_norm, hyp_norm)
        cer = (distance / ref_len) * 100
        return min(cer, 100.0)  # Cap at 100%

    @staticmethod
    def word_error_rate(reference: str, hypothesis: str) -> float:
        """
        Calculate Word Error Rate (WER).
        Lower is better (0% = perfect).
        """
        ref_norm = STTMetrics.normalize_text(reference)
        hyp_norm = STTMetrics.normalize_text(hypothesis)
        
        ref_words = ref_norm.split()
        hyp_words = hyp_norm.split()
        
        ref_len = len(ref_words)
        if ref_len == 0:
            return 0.0 if len(hyp_words) == 0 else 100.0

        distance = STTMetrics._levenshtein_distance(ref_words, hyp_words)
        wer = (distance / ref_len) * 100
        return min(wer, 100.0)  # Cap at 100%

    @staticmethod
    def _levenshtein_distance(ref: List[str], hyp: List[str]) -> int:
        """Calculate Levenshtein distance between two sequences."""
        if len(ref) < len(hyp):
            return STTMetrics._levenshtein_distance(hyp, ref)

        if len(hyp) == 0:
            return len(ref)

        previous_row = range(len(hyp) + 1)
        for i, ref_item in enumerate(ref):
            current_row = [i + 1]
            for j, hyp_item in enumerate(hyp):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (ref_item != hyp_item)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row

        return previous_row[-1]

    @staticmethod
    def similarity_score(reference: str, hypothesis: str) -> float:
        """
        Calculate sequence similarity score (0-100%).
        Uses SequenceMatcher ratio for semantic similarity.
        """
        ref_norm = STTMetrics.normalize_text(reference)
        hyp_norm = STTMetrics.normalize_text(hypothesis)
        
        ratio = SequenceMatcher(None, ref_norm, hyp_norm).ratio()
        return round(ratio * 100, 2)

    @staticmethod
    def accuracy_score(reference: str, hypothesis: str) -> float:
        """
        Calculate overall accuracy (100 - WER).
        """
        wer = STTMetrics.word_error_rate(reference, hypothesis)
        return round(100 - wer, 2)

    @staticmethod
    def calculate_all_metrics(reference: str, hypothesis: str) -> Dict[str, float]:
        """Calculate all metrics at once."""
        return {
            "wer": round(STTMetrics.word_error_rate(reference, hypothesis), 2),
            "cer": round(STTMetrics.character_error_rate(reference, hypothesis), 2),
            "similarity": STTMetrics.similarity_score(reference, hypothesis),
            "accuracy": STTMetrics.accuracy_score(reference, hypothesis),
        }


class BenchmarkScorer:
    """Score and rank benchmark results."""

    @staticmethod
    def calculate_proficiency_score(metrics: Dict[str, float]) -> Dict[str, any]:
        """
        Calculate overall proficiency score (0-100).
        Weighted combination of all metrics.
        """
        # Weights: accuracy dominates, followed by similarity
        weights = {
            "accuracy": 0.50,
            "similarity": 0.30,
            "wer_inverse": 0.20,  # Inverse WER (100 - WER)
        }

        wer_inverse = 100 - metrics.get("wer", 0)
        
        proficiency = (
            weights["accuracy"] * metrics.get("accuracy", 0) +
            weights["similarity"] * metrics.get("similarity", 0) +
            weights["wer_inverse"] * wer_inverse
        )
        proficiency = round(proficiency, 2)

        # Determine proficiency level
        if proficiency >= 90:
            level = "EXCELLENT"
            emoji = "🟢"
        elif proficiency >= 80:
            level = "VERY GOOD"
            emoji = "🟢"
        elif proficiency >= 70:
            level = "GOOD"
            emoji = "🟡"
        elif proficiency >= 60:
            level = "ACCEPTABLE"
            emoji = "🟡"
        else:
            level = "NEEDS IMPROVEMENT"
            emoji = "🔴"

        return {
            "score": proficiency,
            "level": level,
            "emoji": emoji,
            "breakdown": {
                "accuracy_contribution": round(weights["accuracy"] * metrics.get("accuracy", 0), 2),
                "similarity_contribution": round(weights["similarity"] * metrics.get("similarity", 0), 2),
                "wer_contribution": round(weights["wer_inverse"] * wer_inverse, 2),
            }
        }

    @staticmethod
    def grade_result(score: float) -> str:
        """Convert score to grade."""
        if score >= 95:
            return "A+"
        elif score >= 90:
            return "A"
        elif score >= 85:
            return "B+"
        elif score >= 80:
            return "B"
        elif score >= 75:
            return "C+"
        elif score >= 70:
            return "C"
        else:
            return "F"
