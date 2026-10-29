import re

from fastapi import HTTPException, status

_INJECTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"ignore\s+(all\s+)?(previous|prior|system|developer)\s+instructions?",
        r"reveal\s+(the\s+)?(system|developer)\s+(prompt|message)",
        r"override\s+(the\s+)?(rules|tools|policy)",
        r"pretend\s+you\s+are\s+(the\s+)?system",
        r"call\s+(an?\s+)?unlisted\s+tool",
        r"exfiltrate|jailbreak|prompt\s+injection",
    )
]


def validate_user_question(question: str) -> str:
    normalized = " ".join(question.split())
    if any(pattern.search(normalized) for pattern in _INJECTION_PATTERNS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The question contains instructions that cannot be processed by Council",
        )
    return normalized
