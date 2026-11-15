import asyncio
import json

import pytest

from app import ai
from app.schemas import GenerationRequest


def valid_item():
    return {
        "text": "acqua",
        "kind": "word",
        "meaning": "آب",
        "level": "A1",
        "example": "Bevo acqua.",
        "translation": "آب می‌نوشم.",
        "source_text": "avere bisogno di",
    }


def run_generation(monkeypatch, items, count=1):
    async def fake_request_json(**kwargs):
        return json.dumps(
            {"items": items},
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

    return asyncio.run(ai.generate_content(request))


def test_valid_generation(monkeypatch):
    result = run_generation(monkeypatch, [valid_item()])

    assert len(result.items) == 1
    assert result.items[0].text == "acqua"


@pytest.mark.parametrize(
    "changes",
    [
        {"level": "C1"},
        {"source_text": "عبارتی خارج از درخواست"},
        {"text": "avere bisogno di"},
        {"kind": "invalid"},
    ],
)
def test_invalid_generation_rejected(monkeypatch, changes):
    item = {**valid_item(), **changes}

    with pytest.raises(ai.AnalysisError):
        run_generation(monkeypatch, [item])


def test_wrong_count_rejected(monkeypatch):
    with pytest.raises(ai.AnalysisError):
        run_generation(
            monkeypatch,
            [valid_item()],
            count=2,
        )


def test_duplicate_items_rejected(monkeypatch):
    with pytest.raises(ai.AnalysisError):
        run_generation(
            monkeypatch,
            [valid_item(), valid_item()],
            count=2,
        )
