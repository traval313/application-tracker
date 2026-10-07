from fastapi import FastAPI

from app.models import Application

app = FastAPI(title="Application Tracker API")


@app.post("/applications", response_model=Application, status_code=201)
def create_application(application: Application) -> Application:
    return application
