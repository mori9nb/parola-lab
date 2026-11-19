from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated
from pydantic import model_validator

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
    kind: Literal["sentence"] | None = None
    exclude: list[Annotated[str, Field(min_length=1, max_length=2000)]] = Field(default_factory=list, max_length=100)


class GeneratedContent(ContentAnalysis):
    source_text: str = Field(min_length=1, max_length=2000)


class GenerationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[GeneratedContent] = Field(
        min_length=1,
        max_length=5,
    )

class GrammarQuestion(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    text: str = Field(min_length=1, max_length=1000)

    options: list[
        Annotated[str, Field(min_length=1, max_length=200)]
    ] = Field(min_length=4, max_length=4)

    answer: str = Field(min_length=1, max_length=200)

    meaning: str = Field(min_length=1, max_length=2000)
    explanation: str = Field(min_length=1, max_length=3000)

    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"]
    source_text: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_question(self):
        if self.text.count("___") != 1:
            raise ValueError(
                "Question must contain exactly one blank."
            )

        normalized_options = [
            option.strip().casefold()
            for option in self.options
        ]

        if len(set(normalized_options)) != 4:
            raise ValueError("Options must be distinct.")

        if self.answer not in self.options:
            raise ValueError(
                "Answer must exactly match one of the options."
            )

        return self


class GrammarResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[GrammarQuestion] = Field(
        min_length=1,
        max_length=5,
    )