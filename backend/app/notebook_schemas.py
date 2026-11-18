from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


Level = Literal["A1", "A2", "B1", "B2", "C1", "C2"]


class NotebookReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    streak: int = Field(strict=True, ge=0, le=2_147_483_647)
    attempts: int = Field(strict=True, ge=0, le=2_147_483_647)
    correct: int = Field(strict=True, ge=0, le=2_147_483_647)

    # تبدیل میلی‌ثانیهٔ مرورگر به تاریخ ISO در رابط انجام می‌شود.
    due: AwareDatetime

    @model_validator(mode="after")
    def validate_counters(self):
        if self.correct > self.attempts:
            raise ValueError("correct cannot exceed attempts")

        if self.streak > self.correct:
            raise ValueError("streak cannot exceed correct")

        return self


class NotebookItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=2000)
    meaning: str = Field(default="", max_length=2000)

    kind: Literal["word", "phrase", "sentence", "pending"]
    level: Level | None = None

    source_language: str = Field(
        default="fa", min_length=2, max_length=35
    )
    target_language: str = Field(
        default="it", min_length=2, max_length=35
    )

    example: str = Field(default="", max_length=3000)
    translation: str = Field(default="", max_length=3000)
    tag: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=3000)

    origin: Literal["user", "ai", "starter"] = "user"
    source_text: str = Field(default="", max_length=2000)
    analysis_status: Literal["pending", "completed", "failed"]

    # آیتم‌های قدیمی زمان ایجاد ندارند؛ زمان ساختگی نمی‌فرستیم.
    created_at: AwareDatetime | None = None
    review: NotebookReviewIn | None = None

    @model_validator(mode="after")
    def validate_content(self):
        if not self.client_id.strip():
            raise ValueError("client_id cannot be blank")

        if not self.text.strip():
            raise ValueError("text cannot be blank")

        if self.analysis_status == "completed":
            if self.kind == "pending":
                raise ValueError(
                    "completed items cannot have pending kind"
                )

            if not self.meaning.strip() or self.level is None:
                raise ValueError(
                    "completed items require meaning and level"
                )

        return self


class NotebookImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    items: list[NotebookItemIn] = Field(
        min_length=1,
        max_length=500,
    )

    @model_validator(mode="after")
    def validate_unique_ids(self):
        identifiers = [item.client_id for item in self.items]

        if len(identifiers) != len(set(identifiers)):
            raise ValueError(
                "duplicate client_id values in import batch"
            )

        return self