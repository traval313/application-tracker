from datetime import date

import pytest

from app.models import Application
from app.sheets import _validate_sheet_name, application_to_row


class FakeExecute:
    def __init__(self, response: dict) -> None:
        self.response = response

    def execute(self) -> dict:
        return self.response


class FakeSpreadsheets:
    def get(self, **kwargs: str) -> FakeExecute:
        return FakeExecute(
            {
                "sheets": [
                    {"properties": {"title": "Sheet1"}},
                    {"properties": {"title": "Development Test"}},
                ]
            }
        )


class FakeService:
    def spreadsheets(self) -> FakeSpreadsheets:
        return FakeSpreadsheets()


def test_application_to_row_uses_sheet_column_order() -> None:
    application = Application(
        company_name="Figma",
        position="Software Engineering Intern",
        website_link="https://www.figma.com/careers/job/123",
        date_posted=date(2026, 9, 20),
        date_applied=date(2026, 10, 7),
        cover_letter_req=False,
        resume_req=True,
        response_status="Applied",
    )

    assert application_to_row(application) == [
        "Figma",
        "Software Engineering Intern",
        "https://www.figma.com/careers/job/123",
        "2026-09-20",
        "2026-10-07",
        False,
        True,
        "Applied",
    ]


def test_validate_sheet_name_lists_available_tabs() -> None:
    with pytest.raises(RuntimeError, match="Available tabs: Sheet1, Development Test"):
        _validate_sheet_name(FakeService(), "sheet-id", "application_tracker_test")
