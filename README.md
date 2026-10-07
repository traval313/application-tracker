# application-tracker

Chrome extension that automatically captures job applications and syncs them to a Google Sheets application tracker.

## Backend API

Install dependencies:

```bash
pip install -r requirements-dev.txt
```

Run the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Create an application:

```bash
curl -X POST http://127.0.0.1:8000/applications \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Figma",
    "position": "Software Engineering Intern",
    "website_link": "https://www.figma.com/careers/job/123",
    "date_posted": "2026-09-20",
    "date_applied": "2026-10-07",
    "cover_letter_req": false,
    "resume_req": true,
    "response_status": "Applied"
  }'
```
