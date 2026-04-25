"""FastAPI application — stateless PDF/CSV parser service.

This is a minimal service that ONLY parses brokerage statements.
All database operations, encryption, and business logic have moved to Convex.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Finance Tracker Parser",
    description="Stateless PDF/CSV parser and SEC filing extractor for brokerage statements",
    version="0.2.0",
)

# CORS: restrict to known app origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:10614",  # Next.js dev
        "http://localhost:10613",  # Next.js prod (Docker)
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Only the parse endpoint
from app.routers.parse_only import router as parse_router
app.include_router(parse_router)

from app.routers.sec import router as sec_router
app.include_router(sec_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "parser"}
