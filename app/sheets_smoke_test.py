from datetime import date

from app.models import Application
from app.sheets import append_application


if __name__ == "__main__":
    append_application(
        Application(
            company_name="Figma",
            position="Software Engineering Intern",
            website_link="https://www.figma.com/careers/job/123",
            date_posted=date(2026, 9, 20),
            date_applied=date(2026, 10, 7),
            cover_letter_req=False,
            resume_req=True,
            response_status="Applied",
        )
    )
    print("Appended test application to Google Sheets.")
