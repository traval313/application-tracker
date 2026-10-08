from fastapi.testclient import TestClient
import pytest

import app.main as main_module
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_append_application(monkeypatch: pytest.MonkeyPatch) -> list:
    appended_applications = []

    def fake_append_application(application) -> None:
        appended_applications.append(application)

    monkeypatch.setattr(main_module, "append_application", fake_append_application)
    return appended_applications


def valid_application_payload() -> dict:
    return {
        "company_name": "Figma",
        "position": "Software Engineering Intern",
        "website_link": "https://www.figma.com/careers/job/123",
        "date_posted": "2026-09-20",
        "date_applied": "2026-10-07",
        "cover_letter_req": False,
        "resume_req": True,
        "response_status": "Applied",
    }


def test_create_application_appends_application_and_returns_success(
    mock_append_application: list,
) -> None:
    payload = valid_application_payload()

    response = client.post("/applications", json=payload)

    assert response.status_code == 201
    assert response.json() == {
        "success": True,
        "message": "Application appended to Google Sheets.",
        "application": payload,
    }
    assert len(mock_append_application) == 1
    assert mock_append_application[0].company_name == payload["company_name"]


def test_create_application_returns_failure_when_append_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = valid_application_payload()

    def fail_append(application) -> None:
        raise RuntimeError("Sheets rejected the append.")

    monkeypatch.setattr(main_module, "append_application", fail_append)

    response = client.post("/applications", json=payload)

    assert response.status_code == 502
    assert response.json() == {
        "detail": {
            "success": False,
            "message": "Could not append application to Google Sheets.",
        }
    }


def test_create_application_rejects_missing_required_field() -> None:
    payload = valid_application_payload()
    del payload["company_name"]

    response = client.post("/applications", json=payload)

    assert response.status_code == 422


def test_create_application_rejects_incorrect_field_type() -> None:
    payload = valid_application_payload()
    payload["resume_req"] = "definitely"

    response = client.post("/applications", json=payload)

    assert response.status_code == 422


def test_create_application_rejects_extra_fields() -> None:
    payload = valid_application_payload()
    payload["notes"] = "Save this for a later PR."

    response = client.post("/applications", json=payload)

    assert response.status_code == 422
