import os
from pathlib import Path
from typing import Any

from app.models import Application

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
ROOT_DIR = Path(__file__).resolve().parent.parent
CREDENTIALS_PATH = ROOT_DIR / "credentials.json"
TOKEN_PATH = ROOT_DIR / "token.json"
APPLICATION_COLUMNS = [
    "company_name",
    "position",
    "website_link",
    "date_posted",
    "date_applied",
    "cover_letter_req",
    "resume_req",
    "response_status",
]


def append_application(application: Application) -> dict[str, Any]:
    service = get_sheets_service()
    sheet_id = _required_env("GOOGLE_SHEET_ID")
    sheet_name = _required_env("GOOGLE_SHEET_NAME")
    row = application_to_row(application)

    _validate_sheet_name(service, sheet_id, sheet_name)

    return (
        service.spreadsheets()
        .values()
        .append(
            spreadsheetId=sheet_id,
            range=f"{_quote_sheet_name(sheet_name)}!A:H",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [row]},
        )
        .execute()
    )


def application_to_row(application: Application) -> list[Any]:
    data = application.model_dump(mode="json")
    return [data[column] for column in APPLICATION_COLUMNS]


def get_sheets_service() -> Any:
    _load_env()
    credentials = _get_credentials()

    from googleapiclient.discovery import build

    return build("sheets", "v4", credentials=credentials)


def _get_credentials() -> Any:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    credentials = None
    if TOKEN_PATH.exists():
        credentials = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if credentials and credentials.valid:
        return credentials

    if credentials and credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    else:
        if not CREDENTIALS_PATH.exists():
            raise FileNotFoundError(
                f"Missing Google OAuth client file: {CREDENTIALS_PATH}"
            )

        flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
        credentials = flow.run_local_server(port=0)

    TOKEN_PATH.write_text(credentials.to_json(), encoding="utf-8")
    return credentials


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    load_dotenv(ROOT_DIR / ".env")


def _required_env(name: str) -> str:
    _load_env()
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value


def _validate_sheet_name(service: Any, sheet_id: str, sheet_name: str) -> None:
    metadata = (
        service.spreadsheets()
        .get(spreadsheetId=sheet_id, fields="sheets(properties(title))")
        .execute()
    )
    sheet_names = [
        sheet["properties"]["title"] for sheet in metadata.get("sheets", [])
    ]

    if sheet_name not in sheet_names:
        available = ", ".join(sheet_names) or "no sheets found"
        raise RuntimeError(
            f"GOOGLE_SHEET_NAME={sheet_name!r} does not match a tab in the "
            f"spreadsheet. Available tabs: {available}"
        )


def _quote_sheet_name(sheet_name: str) -> str:
    escaped = sheet_name.replace("'", "''")
    return f"'{escaped}'"
