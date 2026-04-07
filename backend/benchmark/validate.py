"""
Quick validation script for the STT Benchmark Suite.
Verify that all components are working correctly.
"""

import sys
import os
import io

# Set UTF-8 encoding for output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def validate_imports():
    """Validate that all modules can be imported."""
    print("🔧 Validating Imports...")

    try:
        from benchmark.metrics import STTMetrics, BenchmarkScorer
        print("  ✓ metrics.py imported successfully")

        from benchmark.test_cases import TestCaseManager
        print("  ✓ test_cases.py imported successfully")

        from benchmark.benchmark_runner import BenchmarkRunner
        print("  ✓ benchmark_runner.py imported successfully")

        from benchmark.report_generator import ReportGenerator
        print("  ✓ report_generator.py imported successfully")

        return True
    except ImportError as e:
        print(f"  ✗ Import error: {e}")
        return False


def validate_test_cases():
    """Validate test cases are properly defined."""
    print("\n🔍 Validating Test Cases...")

    from benchmark.test_cases import TestCaseManager

    all_cases = TestCaseManager.get_all_test_cases()
    print(f"  ✓ {len(all_cases)} test cases found")

    # Check by language
    for lang in ["en", "hi", "mr"]:
        cases = TestCaseManager.get_test_cases_by_language(lang)
        print(f"  ✓ {len(cases)} test cases for {lang.upper()}")

    # Check by difficulty
    for difficulty in ["easy", "medium", "hard"]:
        cases = TestCaseManager.get_test_cases_by_difficulty(difficulty)
        print(f"  ✓ {len(cases)} {difficulty.upper()} difficulty tests")

    return True


def validate_metrics():
    """Validate metric calculations."""
    print("\n📊 Validating Metrics...")

    from benchmark.metrics import STTMetrics, BenchmarkScorer

    reference = "Hello, how are you?"
    hypothesis = "Hello, how are you?"

    # Test exact match
    metrics = STTMetrics.calculate_all_metrics(reference, hypothesis)
    if metrics['accuracy'] >= 95:
        print("  ✓ Exact match accuracy ≥95%")
    else:
        print(f"  ✗ Exact match accuracy = {metrics['accuracy']:.2f}%")
        return False

    if metrics['wer'] <= 5:
        print("  ✓ Exact match WER ≤5%")
    else:
        print(f"  ✗ Exact match WER = {metrics['wer']:.2f}%")
        return False

    # Test similarity score
    if 0 <= metrics['similarity'] <= 100:
        print(f"  ✓ Similarity score in valid range (0-100)")
    else:
        print(f"  ✗ Similarity score out of range: {metrics['similarity']}")
        return False

    # Test proficiency score
    proficiency = BenchmarkScorer.calculate_proficiency_score(metrics)
    if 0 <= proficiency['score'] <= 100:
        print(f"  ✓ Proficiency score in valid range (0-100)")
    else:
        print(f"  ✗ Proficiency score out of range: {proficiency['score']}")
        return False

    if proficiency['level'] in ["EXCELLENT", "VERY GOOD", "GOOD", "ACCEPTABLE", "NEEDS IMPROVEMENT"]:
        print(f"  ✓ Proficiency level valid: {proficiency['level']}")
    else:
        print(f"  ✗ Proficiency level invalid: {proficiency['level']}")
        return False

    return True


def validate_benchmark_runner():
    """Validate benchmark runner."""
    print("\n🚀 Validating Benchmark Runner...")

    from benchmark.benchmark_runner import BenchmarkRunner

    try:
        runner = BenchmarkRunner(model_name="small", device="cpu")
        print("  ✓ BenchmarkRunner instantiated")

        # Test single test run
        result = runner.run_single_test("english_formal")
        print("  ✓ Single test execution successful")

        if "test_name" in result and "proficiency" in result:
            print("  ✓ Result structure valid")
        else:
            print("  ✗ Result structure invalid")
            return False

        # Test statistics
        stats = runner.get_statistics()
        if stats and "total_tests" in stats:
            print(f"  ✓ Statistics calculation successful ({stats['total_tests']} test)")
        else:
            print("  ✗ Statistics calculation failed")
            return False

        return True

    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


def validate_report_generation():
    """Validate report generation."""
    print("\n📄 Validating Report Generation...")

    from benchmark.report_generator import ReportGenerator
    from benchmark.benchmark_runner import BenchmarkRunner

    try:
        runner = BenchmarkRunner()
        runner.run_single_test("english_formal")

        stats = runner.get_statistics()

        # Test text report generation
        text_report = ReportGenerator.generate_text_report(runner.results, stats)
        if text_report and len(text_report) > 100:
            print("  ✓ Text report generation successful")
        else:
            print("  ✗ Text report generation failed")
            return False

        # Verify results directory
        results_dir = os.path.join(os.path.dirname(__file__), "results")
        if not os.path.exists(results_dir):
            os.makedirs(results_dir)
            print("  ✓ Results directory created")

        return True

    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


def run_quick_benchmark():
    """Run a quick benchmark test."""
    print("\n⚡ Running Quick Benchmark...")

    from benchmark.benchmark_runner import BenchmarkRunner

    try:
        runner = BenchmarkRunner()

        test_names = ["english_formal", "hindi_greeting", "marathi_greeting"]
        passed = 0

        for test_name in test_names:
            result = runner.run_single_test(test_name)
            score = result['proficiency']['score']

            if score >= 80:
                passed += 1
                status = "✓"
            else:
                status = "✗"

            print(f"  {status} {test_name}: {score:.2f}")

        print(f"\n  Passed: {passed}/{len(test_names)}")
        return passed == len(test_names)

    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


def main():
    """Run all validations."""
    print("\n" + "="*70)
    print("✅ STT BENCHMARK SUITE - VALIDATION")
    print("="*70)

    checks = [
        validate_imports,
        validate_test_cases,
        validate_metrics,
        validate_benchmark_runner,
        validate_report_generation,
        run_quick_benchmark,
    ]

    all_passed = True
    for check in checks:
        try:
            if not check():
                all_passed = False
        except Exception as e:
            print(f"  ✗ Validation failed: {e}")
            all_passed = False

    # Print summary
    print("\n" + "="*70)
    if all_passed:
        print("✅ ALL VALIDATIONS PASSED!")
        print("="*70)
        print("\n🚀 You can now:")
        print("   1. Run: python demo.py")
        print("   2. Run: python advanced_examples.py")
        print("   3. Integrate with your STT system")
        print()
        return 0
    else:
        print("❌ SOME VALIDATIONS FAILED!")
        print("="*70)
        print("\nPlease check the errors above and try again.")
        print()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
