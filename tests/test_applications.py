from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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


def test_create_application_returns_validated_application() -> None:
    payload = valid_application_payload()

    response = client.post("/applications", json=payload)

    assert response.status_code == 201
    assert response.json() == payload


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
