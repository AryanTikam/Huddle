"""
Test cases for STT benchmark evaluation.
Contains reference transcriptions and expected outputs in multiple languages.
"""

TEST_CASES = {
    # English Test Cases
    "english_formal": {
        "audio_description": "Formal business meeting greeting",
        "reference": "Hello, what are you doing today? I hope you're having a great day.",
        "language": "en",
        "expected_keywords": ["hello", "today", "great", "day"],
        "difficulty": "easy",
    },
    "english_casual": {
        "audio_description": "Casual conversation",
        "reference": "Hey, how's it going? Did you finish that project we talked about?",
        "language": "en",
        "expected_keywords": ["hello", "project"],
        "difficulty": "medium",
    },
    "english_numbers": {
        "audio_description": "Numbers and dates",
        "reference": "The meeting is scheduled for March 25th at 2:30 PM. We need at least 5 participants.",
        "language": "en",
        "expected_keywords": ["march", "25", "230", "5"],
        "difficulty": "medium",
    },
    "english_technical": {
        "audio_description": "Technical terminology",
        "reference": "The API endpoint returns a 200 status code with JSON response containing user data.",
        "language": "en",
        "expected_keywords": ["api", "endpoint", "status", "json"],
        "difficulty": "hard",
    },

    # Hindi Test Cases  
    "hindi_greeting": {
        "audio_description": "Hindi greeting",
        "reference": "नमस्ते, आप कैसे हैं? आपका दिन कैसा चल रहा है?",
        "language": "hi",
        "expected_keywords": ["नमस्ते", "हैं"],
        "difficulty": "easy",
    },
    "hindi_conversation": {
        "audio_description": "Hindi casual conversation",
        "reference": "क्या आपने अपना काम पूरा किया है? मुझसे कल मिलना है।",
        "language": "hi",
        "expected_keywords": ["काम", "कल"],
        "difficulty": "medium",
    },

    # Marathi Test Cases
    "marathi_greeting": {
        "audio_description": "Marathi greeting",
        "reference": "नमस्कार, आप कसे आहात? आपचा दिवस कसा जात आहे?",
        "language": "mr",
        "expected_keywords": ["नमस्कार", "आहात"],
        "difficulty": "easy",
    },
    "marathi_meeting": {
        "audio_description": "Marathi meeting context",
        "reference": "आमचे मीटिंग उद्या सकाळी दहा वाजता आहे. कृपया यास उपस्थित रहा.",
        "language": "mr",
        "expected_keywords": ["मीटिंग", "उद्या"],
        "difficulty": "medium",
    },

    # Edge Cases
    "mixed_language": {
        "audio_description": "Mixed English-Hindi code-switching",
        "reference": "Hello नमस्ते, I want to build एक application that works in multiple languages.",
        "language": "en",
        "expected_keywords": ["hello", "application"],
        "difficulty": "hard",
    },
    "with_acronyms": {
        "audio_description": "Text with acronyms",
        "reference": "The API, URL, and JSON format are important for REST APIs. Our company uses CI/CD.",
        "language": "en",
        "expected_keywords": ["api", "url", "json", "rest"],
        "difficulty": "hard",
    },
    "with_punctuation": {
        "audio_description": "Text with punctuation and special markers",
        "reference": "Wait... I said, 'Hello!' How much will it cost? Maybe 50%?",
        "language": "en",
        "expected_keywords": ["hello", "cost"],
        "difficulty": "medium",
    },
}


class TestCaseManager:
    """Manage test cases for benchmark evaluation."""

    @staticmethod
    def get_all_test_cases():
        """Get all test cases."""
        return TEST_CASES

    @staticmethod
    def get_test_cases_by_language(language: str):
        """Get test cases for specific language."""
        return {
            name: case for name, case in TEST_CASES.items()
            if case["language"] == language
        }

    @staticmethod
    def get_test_cases_by_difficulty(difficulty: str):
        """Get test cases by difficulty level."""
        return {
            name: case for name, case in TEST_CASES.items()
            if case["difficulty"] == difficulty
        }

    @staticmethod
    def get_test_case(test_name: str):
        """Get specific test case."""
        return TEST_CASES.get(test_name)

    @staticmethod
    def list_test_cases():
        """List all available test cases with metadata."""
        summary = []
        for name, case in TEST_CASES.items():
            summary.append({
                "name": name,
                "description": case["audio_description"],
                "language": case["language"],
                "difficulty": case["difficulty"],
                "reference_length": len(case["reference"].split()),
            })
        return summary
