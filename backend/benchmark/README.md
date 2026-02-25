# 🎤 STT Benchmark Suite

A comprehensive benchmarking and scoring system for the Speech-to-Text (STT) module. Measures accuracy, proficiency, and performance across multiple languages and difficulty levels.

## 📊 Features

- **Comprehensive Metrics**: WER, CER, Accuracy, Similarity, and Proficiency scores
- **Multi-Language Support**: English, Hindi, and Marathi test cases
- **Difficulty Levels**: Easy, Medium, and Hard complexity tests
- **Automated Scoring**: Proficiency scoring with grade assignment
- **Report Generation**: Text, HTML, and JSON report formats
- **Performance Tracking**: Track improvements over time
- **Stress Testing**: Simulate real-world transcription errors

## 📁 Structure

```
benchmark/
├── __init__.py                 # Package initialization
├── metrics.py                  # Metric calculation classes
├── test_cases.py               # Test case definitions
├── benchmark_runner.py         # Main benchmark runner
├── report_generator.py         # Report generation
├── demo.py                     # Demo and usage examples
├── requirements.txt            # Dependencies
└── results/                    # Generated reports (auto-created)
```

## 🚀 Quick Start

### 1. Run the Demo Suite

```bash
cd backend/benchmark
python demo.py
```

This runs all 5 demo scenarios:
- **Demo 1**: Quick test on 3 samples
- **Demo 2**: Language-specific benchmarks (English, Hindi, Marathi)
- **Demo 3**: Difficulty level analysis
- **Demo 4**: Complete benchmark suite with reports
- **Demo 5**: Stress test with error simulation

### 2. Run Custom Benchmark

```python
from benchmark_runner import BenchmarkRunner

runner = BenchmarkRunner(model_name="small", device="cpu")

# Run single test
result = runner.run_single_test("english_formal")
print(f"Proficiency: {result['proficiency']['score']:.2f}")

# Run all tests
results = runner.run_all_tests()

# Get statistics
stats = runner.get_statistics()
print(f"Overall Grade: {stats['overall_grade']}")
```

### 3. Test Specific Languages

```python
# English tests only
runner.run_language_tests("en")

# Hindi tests only
runner.run_language_tests("hi")

# Marathi tests only
runner.run_language_tests("mr")
```

## 📋 Available Test Cases

| Test Name | Language | Difficulty | Description |
|-----------|----------|-----------|-------------|
| english_formal | EN | Easy | Formal business greeting |
| english_casual | EN | Medium | Casual conversation |
| english_numbers | EN | Medium | Numbers and dates |
| english_technical | EN | Hard | Technical terminology |
| hindi_greeting | HI | Easy | Simple Hindi greeting |
| hindi_conversation | HI | Medium | Hindi casual chat |
| marathi_greeting | MR | Easy | Marathi greeting |
| marathi_meeting | MR | Medium | Marathi meeting context |
| mixed_language | EN | Hard | Code-switching English-Hindi |
| with_acronyms | EN | Hard | Acronyms and abbreviations |
| with_punctuation | EN | Medium | Punctuation handling |

## 📊 Metrics Explained

### 1. **Word Error Rate (WER)**
- Measures word-level errors: insertions, deletions, substitutions
- Range: 0% - 100% (lower is better)
- Formula: (insertions + deletions + substitutions) / total words

### 2. **Character Error Rate (CER)**
- Measures character-level errors
- Range: 0% - 100% (lower is better)
- Useful for detecting minor differences

### 3. **Accuracy**
- Inverse of WER: Accuracy = 100 - WER
- Range: 0% - 100% (higher is better)

### 4. **Similarity Score**
- Semantic similarity using sequence matching
- Range: 0% - 100% (higher is better)

### 5. **Proficiency Score**
- Weighted combination of all metrics
- Range: 0 - 100 (higher is better)
- Weights:
  - Accuracy: 50%
  - Similarity: 30%
  - Inverse WER: 20%

### 6. **Proficiency Level & Grade**

| Score | Level | Grade | Status |
|-------|-------|-------|--------|
| ≥ 90 | EXCELLENT | A+/A | 🟢 |
| 80-89 | VERY GOOD | B+/B | 🟢 |
| 70-79 | GOOD | C+/C | 🟡 |
| 60-69 | ACCEPTABLE | D | 🟡 |
| < 60 | NEEDS IMPROVEMENT | F | 🔴 |

## 📈 Output Examples

### Console Output
```
🚀 Starting STT Benchmark Suite
   Model: small | Device: cpu
   Total Tests: 11
======================================================================

[1/11] english_formal
    Accuracy: 95.00% | WER: 5.00% | Proficiency: 93.50 🟢

[2/11] english_casual
    Accuracy: 92.00% | WER: 8.00% | Proficiency: 89.20 🟢

...

📊 BENCHMARK STATISTICS
======================================================================
Total Tests Run: 11
Passed Tests (≥80%): 10
Overall Grade: A

Average Metrics:
  - Proficiency Score: 85.32
  - Accuracy: 88.45%
  - Word Error Rate: 11.55%

By Language:
  - EN: 88.50
  - HI: 82.30
  - MR: 81.90

By Difficulty:
  - EASY: 92.10
  - MEDIUM: 85.40
  - HARD: 76.20

✅ Results exported to: results/benchmark_results_20260225_120000.json
```

### HTML Report
Visual dashboard with:
- Summary statistics cards
- Performance bar charts by difficulty
- Language comparison
- Individual test result cards with color coding
- Proficiency metrics display

## 🔧 Integration with STT System

### Method 1: Direct Integration

```python
from utils.stt_service import STTService
from benchmark.benchmark_runner import BenchmarkRunner

# Your STT service
stt = STTService()

# Benchmark runner
runner = BenchmarkRunner()

# Test your STT
test_case = runner.test_cases["english_formal"]
audio = load_audio("audio.wav")  # Your audio

hypothesis = stt.transcribe(audio)  # Get transcription
result = runner.run_single_test("english_formal", hypothesis)

print(f"Your STT Proficiency: {result['proficiency']['score']:.2f}")
```

### Method 2: Batch Evaluation

```python
runner = BenchmarkRunner()
results = []

for test_name in runner.test_cases.keys():
    # Get your STT output
    hypothesis = your_stt_function(test_case)
    
    # Run test
    result = runner.run_single_test(test_name, hypothesis)
    results.append(result)

# Generate reports
stats = runner.get_statistics()
runner.export_results()
```

## 📊 Reports Generated

Each benchmark run generates:

1. **JSON Results** (`benchmark_results_YYYYMMDD_HHMMSS.json`)
   - Complete test data
   - All metrics
   - Statistics
   - Metadata

2. **Text Report** (`benchmark_report_YYYYMMDD_HHMMSS.txt`)
   - Readable format
   - Summary statistics
   - Detailed results
   - Performance breakdown

3. **HTML Report** (`benchmark_report_YYYYMMDD_HHMMSS.html`)
   - Visual dashboard
   - Interactive charts
   - Professional styling
   - Easy to share

## 🎯 Use Cases

### 1. **Performance Baseline**
```python
runner.run_all_tests()
stats = runner.get_statistics()
# Sets baseline performance metrics
```

### 2. **A/B Testing**
Compare two STT models:
```python
# Test model v1
runner_v1 = BenchmarkRunner(model_name="small")
stats_v1 = runner_v1.run_all_tests()

# Test model v2
runner_v2 = BenchmarkRunner(model_name="base")
stats_v2 = runner_v2.run_all_tests()

# Compare
print(f"v1 Score: {stats_v1['average_proficiency']}")
print(f"v2 Score: {stats_v2['average_proficiency']}")
```

### 3. **Language-Specific Optimization**
```python
# Focus on problematic languages
runner.run_language_tests("hi")  # Hindi performance
runner.run_language_tests("mr")  # Marathi performance
```

### 4. **Regression Testing**
```python
# Run periodic benchmarks to track performance
runner.run_all_tests()
runner.export_results(f"benchmark_{date}.json")
# Compare with previous runs to detect regressions
```

## 📝 Adding Custom Test Cases

Edit `test_cases.py`:

```python
TEST_CASES = {
    ...
    "your_test_name": {
        "audio_description": "Your description",
        "reference": "Reference transcription text",
        "language": "en",  # or "hi", "mr"
        "expected_keywords": ["keyword1", "keyword2"],
        "difficulty": "easy",  # or "medium", "hard"
    },
}
```

## 🐛 Troubleshooting

### Import Errors
```bash
# Ensure you're in the backend directory
cd backend

# Run with proper path
python -m benchmark.demo
```

### Missing Results Directory
- The results directory is created automatically
- Check write permissions in `backend/benchmark/`

### Model Loading
- Ensure Whisper is installed: `pip install openai-whisper`
- For CUDA: `pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118`

## 📞 Support

For issues or improvements:
1. Check test case definitions in `test_cases.py`
2. Review metric calculations in `metrics.py`
3. Examine benchmark runner logic in `benchmark_runner.py`

## 📄 License & Usage

Part of the Huddle meeting intelligence system. Use for internal benchmarking and performance tracking.

---

**Last Updated**: February 2026
**Version**: 1.0
