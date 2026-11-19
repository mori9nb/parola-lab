from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.schemas import GrammarQuestion
from app.notebook_schemas import NotebookReviewIn


class GrammarEntryIn(GrammarQuestion):
    client_id: str = Field(min_length=1, max_length=128)

    level: Literal[
        "A1", "A2", "B1", "B2", "C1", "C2"
    ] | None = None

    source_text: str = Field(default="", max_length=2000)
    origin: Literal["starter", "ai", "user"] = "starter"

    created_at: AwareDatetime | None = None
    review: NotebookReviewIn | None = None


from pydantic import BaseModel, ConfigDict


class GrammarImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    items: list[GrammarEntryIn] = Field(
        min_length=1,
        max_length=500,
    )

    @model_validator(mode="after")
    def validate_unique_ids(self):
        ids = [item.client_id for item in self.items]

        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate grammar client_id")

        return self