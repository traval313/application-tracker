from datetime import date
import re
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class Application(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_name: str = Field(..., min_length=1)
    position: str = Field(..., min_length=1)
    website_link: HttpUrl
    date_posted: Optional[date] = None
    date_applied: date
    cover_letter_req: bool
    resume_req: bool
    response_status: str = Field(..., min_length=1)

    @field_validator("date_posted", mode="before")
    @classmethod
    def normalize_optional_date_posted(cls, value):
        if value is None or isinstance(value, date):
            return value

        if not isinstance(value, str):
            return value

        normalized = value.strip()
        if not normalized:
            return None

        iso_date_match = re.match(r"^(\d{4}-\d{2}-\d{2})", normalized)
        if not iso_date_match:
            return None

        posted_date = date.fromisoformat(iso_date_match.group(1))
        if posted_date.year < 2000:
            return None

        return posted_date


class ApplicationCreateResponse(BaseModel):
    success: bool
    message: str
    application: Application
