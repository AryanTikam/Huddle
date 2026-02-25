"""
Report generator for STT benchmark results.
Creates HTML and text reports with visualizations.
"""

import os
from datetime import datetime
from typing import Dict, List
import json


class ReportGenerator:
    """Generate benchmark reports in multiple formats."""

    @staticmethod
    def generate_text_report(results: List[Dict], stats: Dict) -> str:
        """Generate plain text report."""
        report = []
        report.append("=" * 80)
        report.append("STT BENCHMARK REPORT")
        report.append("=" * 80)
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        # Summary
        report.append("EXECUTIVE SUMMARY")
        report.append("-" * 80)
        report.append(f"Total Tests: {stats['total_tests']}")
        report.append(f"Passed (≥80%): {stats['passed_tests']}")
        report.append(f"Overall Grade: {stats['overall_grade']}")
        report.append(f"Average Proficiency: {stats['average_proficiency']:.2f}/100")
        report.append(f"Average Accuracy: {stats['average_accuracy']:.2f}%")
        report.append(f"Word Error Rate: {stats['average_wer']:.2f}%")
        report.append(f"Execution Time: {stats['execution_time']}\n")

        # Performance by Category
        report.append("PERFORMANCE BY DIFFICULTY")
        report.append("-" * 80)
        for difficulty, score in sorted(stats['by_difficulty'].items()):
            bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
            report.append(f"{difficulty.upper():15} | {bar} | {score:.2f}")
        report.append("")

        report.append("PERFORMANCE BY LANGUAGE")
        report.append("-" * 80)
        for language, score in stats['by_language'].items():
            bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
            report.append(f"{language.upper():15} | {bar} | {score:.2f}")
        report.append("")

        # Detailed Results
        report.append("DETAILED RESULTS")
        report.append("-" * 80)
        for i, result in enumerate(results, 1):
            report.append(f"\n[{i}] {result['test_name'].upper()}")
            report.append(f"    Type: {result['test_description']}")
            report.append(f"    Language: {result['language'].upper()} | "
                         f"Difficulty: {result['difficulty'].upper()}")
            
            ref_text = f"\n    Reference: {result['reference'][:80]}..." if len(result['reference']) > 80 else f"    Reference: {result['reference']}"
            report.append(ref_text)
            
            hyp_text = f"    Output:    {result['hypothesis'][:80]}..." if len(result['hypothesis']) > 80 else f"    Output:    {result['hypothesis']}"
            report.append(hyp_text)
            
            report.append(f"\n    Metrics:")
            report.append(f"      • Accuracy:    {result['metrics']['accuracy']:6.2f}%")
            report.append(f"      • Similarity:  {result['metrics']['similarity']:6.2f}%")
            report.append(f"      • WER:         {result['metrics']['wer']:6.2f}%")
            report.append(f"      • CER:         {result['metrics']['cer']:6.2f}%")
            report.append(f"\n    Proficiency: {result['proficiency']['score']:.2f} {result['proficiency']['emoji']} [{result['proficiency']['level']}]")
            report.append(f"    Grade: {result['grade']}")

        report.append("\n" + "=" * 80)
        report.append("END OF REPORT")
        report.append("=" * 80)

        return "\n".join(report)

    @staticmethod
    def generate_html_report(results: List[Dict], stats: Dict, filename: str = None) -> str:
        """Generate HTML report with styling."""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"benchmark_report_{timestamp}.html"

        filepath = os.path.join(
            os.path.dirname(__file__),
            "results",
            filename
        )

        # Create results directory if needed
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        html = []
        html.append("<!DOCTYPE html>")
        html.append("<html>")
        html.append("<head>")
        html.append("  <meta charset='utf-8'>")
        html.append("  <meta name='viewport' content='width=device-width, initial-scale=1'>")
        html.append("  <title>STT Benchmark Report</title>")
        html.append("  <style>")
        html.append("""
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px;
                min-height: 100vh;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 10px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 40px;
                text-align: center;
            }
            .header h1 {
                font-size: 2.5em;
                margin-bottom: 10px;
            }
            .header p {
                font-size: 1.1em;
                opacity: 0.9;
            }
            .content {
                padding: 40px;
            }
            .section {
                margin-bottom: 40px;
            }
            .section h2 {
                color: #333;
                font-size: 1.8em;
                margin-bottom: 20px;
                border-bottom: 3px solid #667eea;
                padding-bottom: 10px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .stat-card {
                background: #f5f5f5;
                padding: 20px;
                border-radius: 8px;
                border-left: 4px solid #667eea;
                text-align: center;
            }
            .stat-card .value {
                font-size: 2em;
                font-weight: bold;
                color: #667eea;
                margin: 10px 0;
            }
            .stat-card .label {
                color: #666;
                font-size: 0.9em;
            }
            .progress-bar {
                background: #e0e0e0;
                height: 30px;
                border-radius: 5px;
                overflow: hidden;
                margin: 10px 0;
            }
            .progress-fill {
                background: linear-gradient(90deg, #667eea, #764ba2);
                height: 100%;
                border-radius: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 0.9em;
            }
            .category {
                margin-bottom: 20px;
            }
            .category-label {
                font-weight: bold;
                color: #333;
                margin-bottom: 8px;
            }
            .test-result {
                background: #f9f9f9;
                padding: 20px;
                margin-bottom: 15px;
                border-radius: 8px;
                border-left: 4px solid #ddd;
            }
            .test-result.excellent {
                border-left-color: #27ae60;
                background: #d5f4e6;
            }
            .test-result.good {
                border-left-color: #f39c12;
                background: #fef5e7;
            }
            .test-result.poor {
                border-left-color: #e74c3c;
                background: #fadbd8;
            }
            .test-name {
                font-size: 1.2em;
                font-weight: bold;
                color: #333;
                margin-bottom: 10px;
            }
            .test-meta {
                font-size: 0.9em;
                color: #666;
                margin-bottom: 10px;
            }
            .metrics-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-top: 10px;
            }
            .metric {
                text-align: center;
            }
            .metric-value {
                font-size: 1.3em;
                font-weight: bold;
                color: #667eea;
            }
            .metric-label {
                font-size: 0.85em;
                color: #666;
            }
            .footer {
                background: #f5f5f5;
                padding: 20px;
                text-align: center;
                color: #666;
                font-size: 0.9em;
            }
            .grade {
                display: inline-block;
                background: #667eea;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
                font-weight: bold;
                margin-left: 10px;
            }
        """)
        html.append("  </style>")
        html.append("</head>")
        html.append("<body>")

        # Header
        html.append("  <div class='container'>")
        html.append("    <div class='header'>")
        html.append("      <h1>🎤 STT Benchmark Report</h1>")
        html.append(f"      <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>")
        html.append("    </div>")

        # Content
        html.append("    <div class='content'>")

        # Summary stats
        html.append("      <div class='section'>")
        html.append("        <h2>📊 Summary</h2>")
        html.append("        <div class='stats-grid'>")

        stats_data = [
            ("Total Tests", str(stats['total_tests'])),
            ("Passed (≥80%)", str(stats['passed_tests'])),
            ("Overall Grade", stats['overall_grade']),
            ("Proficiency", f"{stats['average_proficiency']:.2f}"),
            ("Accuracy", f"{stats['average_accuracy']:.2f}%"),
            ("WER", f"{stats['average_wer']:.2f}%"),
        ]

        for label, value in stats_data:
            html.append("          <div class='stat-card'>")
            html.append(f"            <div class='label'>{label}</div>")
            html.append(f"            <div class='value'>{value}</div>")
            html.append("          </div>")

        html.append("        </div>")
        html.append("      </div>")

        # Performance by difficulty
        html.append("      <div class='section'>")
        html.append("        <h2>🎯 Performance by Difficulty</h2>")
        for difficulty, score in stats['by_difficulty'].items():
            html.append(f"        <div class='category'>")
            html.append(f"          <div class='category-label'>{difficulty.upper()}</div>")
            html.append(f"          <div class='progress-bar'>")
            html.append(f"            <div class='progress-fill' style='width: {score}%'>")
            html.append(f"              {score:.2f}%")
            html.append(f"            </div>")
            html.append(f"          </div>")
            html.append(f"        </div>")
        html.append("      </div>")

        # Performance by language
        html.append("      <div class='section'>")
        html.append("        <h2>🌍 Performance by Language</h2>")
        for language, score in stats['by_language'].items():
            html.append(f"        <div class='category'>")
            html.append(f"          <div class='category-label'>{language.upper()}</div>")
            html.append(f"          <div class='progress-bar'>")
            html.append(f"            <div class='progress-fill' style='width: {score}%'>")
            html.append(f"              {score:.2f}%")
            html.append(f"            </div>")
            html.append(f"          </div>")
            html.append(f"        </div>")
        html.append("      </div>")

        # Detailed results
        html.append("      <div class='section'>")
        html.append("        <h2>📝 Detailed Results</h2>")
        for result in results:
            proficiency = result['proficiency']['score']
            if proficiency >= 80:
                css_class = "excellent"
            elif proficiency >= 60:
                css_class = "good"
            else:
                css_class = "poor"

            html.append(f"        <div class='test-result {css_class}'>")
            html.append(f"          <div class='test-name'>")
            html.append(f"            {result['test_name'].replace('_', ' ').title()}")
            html.append(f"            <span class='grade'>{result['grade']}</span>")
            html.append(f"          </div>")
            html.append(f"          <div class='test-meta'>")
            html.append(f"            {result['test_description']} • ")
            html.append(f"            {result['language'].upper()} • ")
            html.append(f"            {result['difficulty'].upper()}")
            html.append(f"          </div>")
            html.append(f"          <div class='metrics-row'>")
            html.append(f"            <div class='metric'>")
            html.append(f"              <div class='metric-value'>{result['metrics']['accuracy']:.2f}%</div>")
            html.append(f"              <div class='metric-label'>Accuracy</div>")
            html.append(f"            </div>")
            html.append(f"            <div class='metric'>")
            html.append(f"              <div class='metric-value'>{result['metrics']['similarity']:.2f}%</div>")
            html.append(f"              <div class='metric-label'>Similarity</div>")
            html.append(f"            </div>")
            html.append(f"            <div class='metric'>")
            html.append(f"              <div class='metric-value'>{result['proficiency']['score']:.2f}</div>")
            html.append(f"              <div class='metric-label'>Proficiency</div>")
            html.append(f"            </div>")
            html.append(f"          </div>")
            html.append(f"        </div>")

        html.append("      </div>")

        # Footer
        html.append("    </div>")
        html.append("    <div class='footer'>")
        html.append("      <p>STT Benchmark Report | "
                   f"Models: whisper-small | "
                   f"Results automatically generated</p>")
        html.append("    </div>")
        html.append("  </div>")

        html.append("</body>")
        html.append("</html>")

        # Write file
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(html))

        return filepath

    @staticmethod
    def save_text_report(results: List[Dict], stats: Dict, filename: str = None) -> str:
        """Save text report to file."""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"benchmark_report_{timestamp}.txt"

        filepath = os.path.join(
            os.path.dirname(__file__),
            "results",
            filename
        )

        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        report = ReportGenerator.generate_text_report(results, stats)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(report)

        return filepath
