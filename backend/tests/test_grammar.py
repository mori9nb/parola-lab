import asyncio
import json

import pytest
from pydantic import ValidationError

from app import ai
from app.schemas import GenerationRequest, GrammarQuestion


def valid_question():
    return {
        "text": "Io ___ bisogno di aiuto.",
        "options": ["ho", "hai", "ha", "abbiamo"],
        "answer": "ho",
        "meaning": "من به کمک نیاز دارم.",
        "explanation": "فعل avere برای io به صورت ho صرف می‌شود.",
        "level": "A1",
        "source_text": "avere bisogno di",
    }


def test_valid_grammar_question():
    question = GrammarQuestion.model_validate(valid_question())

    assert question.answer == "ho"


@pytest.mark.parametrize(
    "changes",
    [
        {"text": "Io ho bisogno di aiuto."},
        {"text": "Io ___ bisogno ___ aiuto."},
        {"options": ["ho", "hai", "ha"]},
        {"options": ["ho", "ho", "ha", "abbiamo"]},
        {"answer": "avete"},
    ],
)
def test_invalid_question_rejected(changes):
    data = {**valid_question(), **changes}

    with pytest.raises(ValidationError):
        GrammarQuestion.model_validate(data)


def run_generation(monkeypatch, questions, count=1):
    async def fake_request_json(**kwargs):
        return json.dumps(
            {"items": questions},
            ensure_ascii=False,
        )

    monkeypatch.setattr(
        ai,
        "request_json",
        fake_request_json,
    )

    request = GenerationRequest(
        seeds=["avere bisogno di"],
        target_level="A1",
        count=count,
    )

    return asyncio.run(ai.generate_grammar(request))


def test_valid_grammar_generation(monkeypatch):
    result = run_generation(monkeypatch, [valid_question()])

    assert len(result.items) == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"level": "C1"},
        {"source_text": "riuscire a"},
    ],
)
def test_generation_constraints(monkeypatch, changes):
    question = {**valid_question(), **changes}

    with pytest.raises(ai.AnalysisError):
        run_generation(monkeypatch, [question])


def test_wrong_count_rejected(monkeypatch):
    with pytest.raises(ai.AnalysisError):
        run_generation(monkeypatch, [valid_question()], count=2)


def test_duplicate_questions_rejected(monkeypatch):
    with pytest.raises(ai.AnalysisError):
        run_generation(
            monkeypatch,
            [valid_question(), valid_question()],
            count=2,
        )
