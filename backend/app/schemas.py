from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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