"""
Benchmark runner for STT performance evaluation.
Runs test cases and generates comprehensive reports.
"""

import sys
import os
from datetime import datetime
from typing import Dict, List
import json

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from benchmark.metrics import STTMetrics, BenchmarkScorer
from benchmark.test_cases import TestCaseManager
from benchmark.report_generator import ReportGenerator


class BenchmarkRunner:
    """Execute benchmark tests and collect results."""

    def __init__(self, model_name: str = "small", device: str = "cpu"):
        """
        Initialize benchmark runner.
        
        Args:
            model_name: Whisper model size (tiny, base, small, medium, large)
            device: Device to run on (cpu or cuda)
        """
        self.model_name = model_name
        self.device = device
        self.results = []
        self.test_cases = TestCaseManager.get_all_test_cases()
        self.start_time = None
        self.end_time = None

    def simulate_stt_output(self, test_case_name: str, introduce_error: bool = False) -> str:
        """
        Simulate STT output with optional controlled errors for testing.
        In production, this would call the actual Whisper model.
        """
        test_case = self.test_cases[test_case_name]
        reference = test_case["reference"]

        if not introduce_error:
            # Perfect transcription
            return reference
        else:
            # Introduce realistic errors based on difficulty
            difficulty = test_case["difficulty"]
            if difficulty == "easy":
                # 5% error rate
                return reference.replace("are", "r").replace("the", "th")
            elif difficulty == "medium":
                # 10% error rate
                return reference.replace("the", "").replace("ing", "in")
            else:
                # 20% error rate for hard cases
                words = reference.split()
                words[0] = words[0][:-1] if len(words[0]) > 1 else words[0]
                return " ".join(words)

    def run_single_test(self, test_case_name: str, hypothesis: str = None) -> Dict:
        """
        Run a single test case.
        
        Args:
            test_case_name: Name of test case to run
            hypothesis: Actual STT output (if None, simulates perfect transcription)
        
        Returns:
            Dictionary with test results
        """
        if test_case_name not in self.test_cases:
            raise ValueError(f"Test case '{test_case_name}' not found")

        test_case = self.test_cases[test_case_name]
        reference = test_case["reference"]

        # Use provided hypothesis or simulate
        if hypothesis is None:
            hypothesis = self.simulate_stt_output(test_case_name, introduce_error=False)

        # Calculate metrics
        metrics = STTMetrics.calculate_all_metrics(reference, hypothesis)
        proficiency = BenchmarkScorer.calculate_proficiency_score(metrics)

        result = {
            "test_name": test_case_name,
            "test_description": test_case["audio_description"],
            "language": test_case["language"],
            "difficulty": test_case["difficulty"],
            "reference": reference,
            "hypothesis": hypothesis,
            "metrics": metrics,
            "proficiency": proficiency,
            "grade": BenchmarkScorer.grade_result(proficiency["score"]),
            "timestamp": datetime.now().isoformat(),
        }

        self.results.append(result)
        return result

    def run_all_tests(self, use_errors: bool = False) -> List[Dict]:
        """
        Run all test cases.
        
        Args:
            use_errors: If True, introduces controlled errors in transcription
        
        Returns:
            List of all test results
        """
        self.start_time = datetime.now()
        print(f"🚀 Starting STT Benchmark Suite")
        print(f"   Model: {self.model_name} | Device: {self.device}")
        print(f"   Total Tests: {len(self.test_cases)}")
        print("=" * 70)

        for i, test_name in enumerate(self.test_cases.keys(), 1):
            hypothesis = self.simulate_stt_output(test_name, introduce_error=use_errors)
            result = self.run_single_test(test_name, hypothesis)

            print(f"\n[{i}/{len(self.test_cases)}] {test_name}")
            print(f"    Accuracy: {result['metrics']['accuracy']:.2f}% | "
                  f"WER: {result['metrics']['wer']:.2f}% | "
                  f"Proficiency: {result['proficiency']['score']:.2f} "
                  f"{result['proficiency']['emoji']}")

        self.end_time = datetime.now()
        print("\n" + "=" * 70)
        return self.results

    def run_language_tests(self, language: str, use_errors: bool = False) -> List[Dict]:
        """Run tests for specific language only."""
        test_cases = TestCaseManager.get_test_cases_by_language(language)
        
        print(f"🚀 Testing {language.upper()} Language ({len(test_cases)} tests)")
        print("=" * 70)

        self.start_time = datetime.now()
        for test_name in test_cases.keys():
            hypothesis = self.simulate_stt_output(test_name, introduce_error=use_errors)
            result = self.run_single_test(test_name, hypothesis)

            print(f"  {test_name}: {result['proficiency']['score']:.2f} "
                  f"{result['proficiency']['level']}")

        self.end_time = datetime.now()
        return self.results

    def get_statistics(self) -> Dict:
        """Calculate overall benchmark statistics."""
        if not self.results:
            return {}

        accuracies = [r["metrics"]["accuracy"] for r in self.results]
        wers = [r["metrics"]["wer"] for r in self.results]
        proficiencies = [r["proficiency"]["score"] for r in self.results]

        # Count by difficulty
        by_difficulty = {}
        for r in self.results:
            difficulty = r["difficulty"]
            if difficulty not in by_difficulty:
                by_difficulty[difficulty] = []
            by_difficulty[difficulty].append(r["proficiency"]["score"])

        # Count by language
        by_language = {}
        for r in self.results:
            language = r["language"]
            if language not in by_language:
                by_language[language] = []
            by_language[language].append(r["proficiency"]["score"])

        return {
            "total_tests": len(self.results),
            "passed_tests": sum(1 for r in self.results if r["proficiency"]["score"] >= 80),
            "average_accuracy": round(sum(accuracies) / len(accuracies), 2),
            "average_wer": round(sum(wers) / len(wers), 2),
            "average_proficiency": round(sum(proficiencies) / len(proficiencies), 2),
            "overall_grade": BenchmarkScorer.grade_result(sum(proficiencies) / len(proficiencies)),
            "min_proficiency": round(min(proficiencies), 2),
            "max_proficiency": round(max(proficiencies), 2),
            "by_difficulty": {
                difficulty: round(sum(scores) / len(scores), 2)
                for difficulty, scores in by_difficulty.items()
            },
            "by_language": {
                language: round(sum(scores) / len(scores), 2)
                for language, scores in by_language.items()
            },
            "execution_time": str(self.end_time - self.start_time) if self.end_time else None,
        }

    def export_results(self, filename: str = None) -> str:
        """
        Export results to JSON file.
        
        Returns:
            Path to exported file
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"benchmark_results_{timestamp}.json"

        filepath = os.path.join(
            os.path.dirname(__file__),
            "results",
            filename
        )

        # Create results directory if needed
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        data = {
            "metadata": {
                "model": self.model_name,
                "device": self.device,
                "timestamp": datetime.now().isoformat(),
                "statistics": self.get_statistics(),
            },
            "results": self.results,
        }

        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

        return filepath


def main():
    """Run benchmark suite with default settings."""
    runner = BenchmarkRunner(model_name="small", device="cpu")

    # Run all tests (with simulated perfect transcriptions)
    results = runner.run_all_tests(use_errors=False)

    # Print statistics
    stats = runner.get_statistics()
    print("\n📊 BENCHMARK STATISTICS")
    print("=" * 70)
    print(f"Total Tests Run: {stats['total_tests']}")
    print(f"Passed Tests (≥80%): {stats['passed_tests']}")
    print(f"Overall Grade: {stats['overall_grade']}")
    print(f"\nAverage Metrics:")
    print(f"  - Proficiency Score: {stats['average_proficiency']:.2f}")
    print(f"  - Accuracy: {stats['average_accuracy']:.2f}%")
    print(f"  - Word Error Rate: {stats['average_wer']:.2f}%")
    print(f"\nBy Language:")
    for lang, score in stats["by_language"].items():
        print(f"  - {lang.upper()}: {score:.2f}")
    print(f"\nBy Difficulty:")
    for difficulty, score in stats["by_difficulty"].items():
        print(f"  - {difficulty.upper()}: {score:.2f}")

    # Export results
    export_path = runner.export_results()
    print(f"\n✅ Results exported to: {export_path}")

    return stats


if __name__ == "__main__":
    main()
