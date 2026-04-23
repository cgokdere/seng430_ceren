from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Ensure project root is in sys.path so 'ml' package can be imported
# when running from either root or backend/ folder
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.append(root_dir)
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

# Import Routers
from routers import train, results, outliers, preprocessing, certificate, ai_advisor

app = FastAPI(title="Health-AI Data Preparation API")

# Include Routers
app.include_router(train.router)
app.include_router(results.router)
app.include_router(outliers.router)
app.include_router(preprocessing.router)
app.include_router(certificate.router)
app.include_router(ai_advisor.router)

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/api/docs")

@app.get("/health", include_in_schema=False)
def health():
    return {"ok": True}

def _load_allowed_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGINS", "").strip()
    if raw:
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return [
        "https://healthai-juniorengineers-2.onrender.com",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5501",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)