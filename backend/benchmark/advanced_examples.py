"""
Advanced usage examples for the STT Benchmark Suite.
Shows how to integrate with your actual STT system.
"""

import sys
import os
import io

# Set UTF-8 encoding for output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from benchmark.benchmark_runner import BenchmarkRunner
from benchmark.metrics import STTMetrics, BenchmarkScorer
from benchmark.test_cases import TestCaseManager
from benchmark.report_generator import ReportGenerator


# ============================================================================
# Example 1: Real-world STT Integration
# ============================================================================

def example_integrate_with_stt():
    """
    Show how to integrate benchmark with actual STT system.
    """
    print("\n" + "="*70)
    print("Example 1: Integrating with Actual STT System")
    print("="*70)

    runner = BenchmarkRunner(model_name="small", device="cpu")

    # Simulate getting outputs from your STT system
    test_cases = TestCaseManager.get_all_test_cases()

    print("\nRunning benchmark with simulated STT outputs...")

    for i, (test_name, test_case) in enumerate(list(test_cases.items())[:3], 1):
        # In real scenario, you would call your STT system
        # hypothesis = your_stt_system.transcribe(audio_file)
        hypothesis = runner.simulate_stt_output(test_name, introduce_error=False)

        # Run benchmark test
        result = runner.run_single_test(test_name, hypothesis)

        print(f"\n[{i}] {test_name}")
        print(f"    Reference: {result['reference'][:60]}...")
        print(f"    Got:       {result['hypothesis'][:60]}...")
        print(f"    Score:     {result['proficiency']['score']:.2f} {result['proficiency']['level']}")


# ============================================================================
# Example 2: Performance Comparison
# ============================================================================

def example_performance_comparison():
    """
    Compare different STT models/configurations.
    """
    print("\n" + "="*70)
    print("Example 2: Performance Comparison (Model vs Configuration)")
    print("="*70)

    test_names = ["english_formal", "english_technical", "hindi_greeting"]

    results = {}

    # Test without errors
    print("\nScenario A: Perfect Transcription")
    runner_a = BenchmarkRunner(model_name="small")
    for test_name in test_names:
        result = runner_a.run_single_test(test_name, introduce_error=False)
        results.setdefault("Perfect", {})[test_name] = result['proficiency']['score']

    # Test with errors
    print("\nScenario B: With Transcription Errors")
    runner_b = BenchmarkRunner(model_name="small")
    for test_name in test_names:
        hypothesis = runner_b.simulate_stt_output(test_name, introduce_error=True)
        result = runner_b.run_single_test(test_name, hypothesis)
        results.setdefault("With Errors", {})[test_name] = result['proficiency']['score']

    # Print comparison
    print("\n📊 Comparison Results:")
    print(f"{'Test Name':<25} {'Perfect':<15} {'With Errors':<15}")
    print("-" * 55)
    for test_name in test_names:
        perfect = results["Perfect"][test_name]
        with_errors = results["With Errors"][test_name]
        diff = perfect - with_errors
        print(f"{test_name:<25} {perfect:>6.2f}         {with_errors:>6.2f} (Δ {diff:+.2f})")


# ============================================================================
# Example 3: Language Performance Analysis
# ============================================================================

def example_language_analysis():
    """
    Analyze performance across different languages.
    """
    print("\n" + "="*70)
    print("Example 3: Language Performance Analysis")
    print("="*70)

    runner = BenchmarkRunner()
    language_stats = {}

    for lang in ["en", "hi", "mr"]:
        print(f"\nAnalyzing {lang.upper()} tests...")

        test_cases = TestCaseManager.get_test_cases_by_language(lang)
        scores = []

        for test_name in test_cases.keys():
            result = runner.run_single_test(test_name)
            scores.append(result['proficiency']['score'])

        avg_score = sum(scores) / len(scores)
        language_stats[lang] = {
            "count": len(scores),
            "average": avg_score,
            "min": min(scores),
            "max": max(scores),
        }

    # Print analysis
    print("\n📈 Language Performance Summary:")
    print(f"{'Language':<12} {'Tests':<8} {'Avg Score':<12} {'Min':<8} {'Max':<8}")
    print("-" * 50)

    for lang in ["en", "hi", "mr"]:
        stats = language_stats[lang]
        print(f"{lang.upper():<12} {stats['count']:<8} {stats['average']:>6.2f}      "
              f"{stats['min']:>6.2f}  {stats['max']:>6.2f}")


# ============================================================================
# Example 4: Difficulty Level Analysis
# ============================================================================

def example_difficulty_analysis():
    """
    Analyze performance across difficulty levels.
    """
    print("\n" + "="*70)
    print("Example 4: Difficulty Level Analysis")
    print("="*70)

    runner = BenchmarkRunner()
    difficulty_stats = {}

    for difficulty in ["easy", "medium", "hard"]:
        print(f"\nTesting {difficulty.upper()} difficulty...")

        test_cases = TestCaseManager.get_test_cases_by_difficulty(difficulty)
        scores = []

        for test_name in test_cases.keys():
            result = runner.run_single_test(test_name)
            scores.append(result['proficiency']['score'])

        avg_score = sum(scores) / len(scores)
        difficulty_stats[difficulty] = {
            "count": len(scores),
            "average": avg_score,
            "std_dev": calculate_std_dev(scores, avg_score),
        }

    # Print analysis
    print("\n📊 Difficulty Performance Summary:")
    print(f"{'Difficulty':<12} {'Tests':<8} {'Avg Score':<12} {'Std Dev':<10}")
    print("-" * 45)

    for difficulty in ["easy", "medium", "hard"]:
        stats = difficulty_stats[difficulty]
        print(f"{difficulty.upper():<12} {stats['count']:<8} {stats['average']:>6.2f}      "
              f"{stats['std_dev']:>6.2f}")


# ============================================================================
# Example 5: Custom Metric Calculation
# ============================================================================

def example_custom_metrics():
    """
    Calculate custom metrics for specific transcriptions.
    """
    print("\n" + "="*70)
    print("Example 5: Custom Metric Calculation")
    print("="*70)

    # Define reference and hypothesis
    reference = "Hello, what are you doing today?"
    hypothesis = "Hello, what are you doing?"

    print(f"\nReference:  {reference}")
    print(f"Hypothesis: {hypothesis}")

    # Calculate all metrics
    metrics = STTMetrics.calculate_all_metrics(reference, hypothesis)

    print(f"\n📊 Metrics:")
    print(f"  - Accuracy:   {metrics['accuracy']:.2f}%")
    print(f"  - Similarity: {metrics['similarity']:.2f}%")
    print(f"  - WER:        {metrics['cer']:.2f}%")
    print(f"  - CER:        {metrics['cer']:.2f}%")

    # Calculate proficiency
    proficiency = BenchmarkScorer.calculate_proficiency_score(metrics)
    print(f"\n🎯 Proficiency:")
    print(f"  - Score: {proficiency['score']:.2f}")
    print(f"  - Level: {proficiency['level']} {proficiency['emoji']}")
    print(f"  - Grade: {BenchmarkScorer.grade_result(proficiency['score'])}")


# ============================================================================
# Example 6: Monitoring Performance Over Time
# ============================================================================

def example_performance_monitoring():
    """
    Show how to track performance over time.
    """
    print("\n" + "="*70)
    print("Example 6: Performance Monitoring Over Time")
    print("="*70)

    print("\nSimulating 3 benchmark runs over time...")

    scores_over_time = []

    for iteration in range(1, 4):
        print(f"\nRun {iteration}:")
        runner = BenchmarkRunner()

        # Run a subset of tests
        test_cases = list(TestCaseManager.get_test_cases_by_language("en").keys())[:3]

        scores = []
        for test_name in test_cases:
            result = runner.run_single_test(test_name)
            scores.append(result['proficiency']['score'])

        avg_score = sum(scores) / len(scores)
        scores_over_time.append(avg_score)

        print(f"  Average Score: {avg_score:.2f}")

    # Show trend
    print("\n📈 Performance Trend:")
    print(f"  Run 1: {scores_over_time[0]:.2f}")
    print(f"  Run 2: {scores_over_time[1]:.2f} ({scores_over_time[1] - scores_over_time[0]:+.2f})")
    print(f"  Run 3: {scores_over_time[2]:.2f} ({scores_over_time[2] - scores_over_time[1]:+.2f})")

    if scores_over_time[-1] > scores_over_time[0]:
        print(f"\n✅ Overall trend: IMPROVING (+{scores_over_time[-1] - scores_over_time[0]:.2f})")
    elif scores_over_time[-1] < scores_over_time[0]:
        print(f"\n⚠️  Overall trend: DECLINING ({scores_over_time[-1] - scores_over_time[0]:+.2f})")
    else:
        print(f"\n➡️  Overall trend: STABLE")


# ============================================================================
# Example 7: Stress Testing
# ============================================================================

def example_stress_testing():
    """
    Perform stress testing with various error conditions.
    """
    print("\n" + "="*70)
    print("Example 7: Stress Testing")
    print("="*70)

    runner = BenchmarkRunner()
    test_names = ["english_formal", "english_technical", "hindi_greeting"]

    scenarios = {
        "no_error": False,
        "with_error": True,
    }

    results = {}

    for scenario_name, use_error in scenarios.items():
        print(f"\nScenario: {scenario_name.replace('_', ' ').title()}")
        scores = []

        for test_name in test_names:
            hypothesis = runner.simulate_stt_output(test_name, introduce_error=use_error)
            result = runner.run_single_test(test_name, hypothesis)
            scores.append(result['proficiency']['score'])

        avg_score = sum(scores) / len(scores)
        results[scenario_name] = avg_score
        print(f"  Average Score: {avg_score:.2f}")

    # Print stress test results
    print("\n📊 Stress Test Results:")
    for scenario, score in results.items():
        bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
        print(f"  {scenario:<20} {bar} {score:.2f}")


# ============================================================================
# Helper Functions
# ============================================================================

def calculate_std_dev(scores, mean):
    """Calculate standard deviation."""
    variance = sum((x - mean) ** 2 for x in scores) / len(scores)
    return variance ** 0.5


# ============================================================================
# Main
# ============================================================================

def main():
    """Run all examples."""
    print("\n" + "="*70)
    print("🎤 STT BENCHMARK SUITE - ADVANCED EXAMPLES")
    print("="*70)

    try:
        example_integrate_with_stt()
        example_performance_comparison()
        example_language_analysis()
        example_difficulty_analysis()
        example_custom_metrics()
        example_performance_monitoring()
        example_stress_testing()

        print("\n" + "="*70)
        print("✅ All examples completed successfully!")
        print("="*70)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
