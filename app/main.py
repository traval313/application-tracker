from fastapi import FastAPI, HTTPException

from app.models import Application, ApplicationCreateResponse
from app.sheets import append_application

app = FastAPI(title="Application Tracker API")


@app.post("/applications", response_model=ApplicationCreateResponse, status_code=201)
def create_application(application: Application) -> ApplicationCreateResponse:
    try:
        append_application(application)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "success": False,
                "message": "Could not append application to Google Sheets.",
            },
        ) from exc

    return ApplicationCreateResponse(
        success=True,
        message="Application appended to Google Sheets.",
        application=application,
    )
