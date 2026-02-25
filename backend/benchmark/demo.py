"""
Demo script to run STT benchmark with various scenarios.
Shows how to use the benchmark suite with your STT system.
"""

import sys
import os
import io

# Set UTF-8 encoding for output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from benchmark.benchmark_runner import BenchmarkRunner
from benchmark.report_generator import ReportGenerator
from benchmark.test_cases import TestCaseManager


def demo_quick_test():
    """Run quick benchmark on a few tests."""
    print("\n" + "="*70)
    print("DEMO 1: Quick Benchmark (3 tests)")
    print("="*70)

    runner = BenchmarkRunner(model_name="small", device="cpu")

    # Test specific cases
    test_names = ["english_formal", "hindi_greeting", "marathi_greeting"]
    for test_name in test_names:
        result = runner.run_single_test(test_name)
        print(f"\n✓ {test_name}")
        print(f"  Proficiency: {result['proficiency']['score']:.2f} {result['proficiency']['level']}")
        print(f"  Accuracy: {result['metrics']['accuracy']:.2f}%")

    return runner


def demo_language_specific():
    """Run benchmark for specific languages."""
    print("\n" + "="*70)
    print("DEMO 2: Language-Specific Benchmarks")
    print("="*70)

    runner = BenchmarkRunner(model_name="small", device="cpu")

    # Test by language
    languages = ["en", "hi", "mr"]
    results_by_lang = {}

    for lang in languages:
        test_cases = TestCaseManager.get_test_cases_by_language(lang)
        print(f"\nTesting {lang.upper()} ({len(test_cases)} tests)...")

        lang_results = []
        for test_name in test_cases.keys():
            result = runner.run_single_test(test_name)
            lang_results.append(result['proficiency']['score'])

        avg_score = sum(lang_results) / len(lang_results)
        results_by_lang[lang] = avg_score
        print(f"  Average Proficiency: {avg_score:.2f}")

    # Print summary
    print("\n📊 Language Comparison:")
    for lang, score in sorted(results_by_lang.items(), key=lambda x: x[1], reverse=True):
        bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
        print(f"  {lang.upper()}: {bar} {score:.2f}")

    return runner


def demo_difficulty_levels():
    """Run benchmark across difficulty levels."""
    print("\n" + "="*70)
    print("DEMO 3: Difficulty Level Analysis")
    print("="*70)

    runner = BenchmarkRunner(model_name="small", device="cpu")

    difficulties = ["easy", "medium", "hard"]
    results_by_difficulty = {}

    for difficulty in difficulties:
        test_cases = TestCaseManager.get_test_cases_by_difficulty(difficulty)
        print(f"\nTesting {difficulty.upper()} ({len(test_cases)} tests)...")

        diff_results = []
        for test_name in test_cases.keys():
            result = runner.run_single_test(test_name)
            diff_results.append(result['proficiency']['score'])

        avg_score = sum(diff_results) / len(diff_results)
        results_by_difficulty[difficulty] = avg_score
        print(f"  Average Proficiency: {avg_score:.2f}")

    # Print summary
    print("\n📊 Difficulty Comparison:")
    for difficulty in ["easy", "medium", "hard"]:
        score = results_by_difficulty[difficulty]
        bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
        print(f"  {difficulty.upper()}: {bar} {score:.2f}")

    return runner


def demo_full_suite():
    """Run complete benchmark suite."""
    print("\n" + "="*70)
    print("DEMO 4: Complete Benchmark Suite (All Tests)")
    print("="*70)

    runner = BenchmarkRunner(model_name="small", device="cpu")

    # Run all tests
    results = runner.run_all_tests(use_errors=False)

    # Get statistics
    stats = runner.get_statistics()

    # Print detailed summary
    print("\n📊 BENCHMARK SUMMARY")
    print("="*70)
    print(f"Total Tests: {stats['total_tests']}")
    print(f"Passed (≥80%): {stats['passed_tests']}")
    print(f"Overall Grade: {stats['overall_grade']}")
    print(f"Average Proficiency: {stats['average_proficiency']:.2f}/100")
    print(f"Average Accuracy: {stats['average_accuracy']:.2f}%")
    print(f"Word Error Rate: {stats['average_wer']:.2f}%")

    print("\n📈 Performance Breakdown:")
    print("\nBy Difficulty:")
    for difficulty, score in stats["by_difficulty"].items():
        print(f"  {difficulty.upper():10} - {score:6.2f}")

    print("\nBy Language:")
    for language, score in stats["by_language"].items():
        print(f"  {language.upper():10} - {score:6.2f}")

    # Generate reports
    print("\n📄 Generating reports...")
    text_report_path = ReportGenerator.save_text_report(results, stats)
    html_report_path = ReportGenerator.generate_html_report(results, stats)

    print(f"✅ Text Report: {text_report_path}")
    print(f"✅ HTML Report: {html_report_path}")

    # Export JSON results
    results_path = runner.export_results()
    print(f"✅ JSON Results: {results_path}")

    return runner, stats


def demo_stress_test():
    """Run benchmark with error simulation."""
    print("\n" + "="*70)
    print("DEMO 5: Stress Test (With Simulated Errors)")
    print("="*70)

    runner = BenchmarkRunner(model_name="small", device="cpu")

    # Run all tests with introduced errors
    print("Running with controlled transcription errors...")
    results = runner.run_all_tests(use_errors=True)

    stats = runner.get_statistics()

    print(f"\n⚠️  Performance with Errors:")
    print(f"  Average Proficiency: {stats['average_proficiency']:.2f}/100")
    print(f"  Average Accuracy: {stats['average_accuracy']:.2f}%")
    print(f"  Word Error Rate: {stats['average_wer']:.2f}%")

    return runner


def print_test_cases_info():
    """Print available test cases."""
    print("\n" + "="*70)
    print("Available Test Cases")
    print("="*70)

    test_cases = TestCaseManager.list_test_cases()

    print(f"\nTotal Tests: {len(test_cases)}\n")
    for case in test_cases:
        print(f"  {case['name']:25} | {case['language']:5} | {case['difficulty']:8} | {case['reference_length']:2} words")


def main():
    """Run all demos."""
    print("\n" + "="*70)
    print("🎤 STT BENCHMARK DEMO SUITE")
    print("="*70)

    # Show available tests
    print_test_cases_info()

    # Run demos
    demo_quick_test()
    demo_language_specific()
    demo_difficulty_levels()
    runner, stats = demo_full_suite()
    demo_stress_test()

    print("\n" + "="*70)
    print("✅ All demos completed successfully!")
    print("="*70)
    print("\nYou can now:")
    print("  1. Run individual tests with custom transcriptions")
    print("  2. Integrate the benchmark with your actual STT system")
    print("  3. Generate periodic benchmark reports")
    print("  4. Track performance improvements over time")
    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
