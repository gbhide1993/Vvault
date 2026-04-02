from typing import Optional

class AnswerMetadata:
    def __init__(
        self,
        answer: str,
        confidence: float,
        source: str,
        justification: str,
        evidence: list = None,   # 👈 NEW
        matched_question: Optional[str] = None,
    ):
        self.answer = answer
        self.confidence = confidence
        self.source = source
        self.justification = justification
        self.evidence = evidence or []   # 👈 NEW
        self.matched_question = matched_question

    def to_dict(self):
        return {
            "answer": self.answer,
            "confidence": self.confidence,
            "source": self.source,
            "justification": self.justification,
            "evidence": self.evidence,
            "matched_question": self.matched_question,
        }