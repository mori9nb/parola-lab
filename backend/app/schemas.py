from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated

class ContentAnalysis(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    text: str = Field(min_length=1, max_length=2000)

    kind: Literal["word", "phrase", "sentence"]

    meaning: str = Field(min_length=1, max_length=2000)

    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"]

    example: str = Field(min_length=1, max_length=3000)

    translation: str = Field(min_length=1, max_length=3000)

class GenerationRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    seeds: list[
    Annotated[str, Field(min_length=1, max_length=2000)]
] = Field(min_length=1, max_length=10)
    target_level: Literal["A1", "A2", "B1", "B2", "C1", "C2"]
    count: int = Field(default=3, ge=1, le=5)


class GeneratedContent(ContentAnalysis):
    source_text: str = Field(min_length=1, max_length=2000)


class GenerationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[GeneratedContent] = Field(
        min_length=1,
        max_length=5,
    )