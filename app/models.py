from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


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


class ApplicationCreateResponse(BaseModel):
    success: bool
    message: str
    application: Application
