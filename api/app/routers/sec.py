"""SEC filing extraction endpoints for moat analysis."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.sec_extractor import extract_filing_sections, segment_transcript

router = APIRouter(prefix="/api/sec", tags=["sec"])


class ExtractFilingRequest(BaseModel):
    url: str
    filing_type: str = "10-K"


class ExtractFilingResponse(BaseModel):
    sections: dict
    metadata: dict


class ExtractTranscriptRequest(BaseModel):
    text: str


class ExtractTranscriptResponse(BaseModel):
    management_commentary: str
    qa_section: str
    metadata: dict


@router.post("/extract-filing", response_model=ExtractFilingResponse)
async def extract_filing(req: ExtractFilingRequest):
    """Fetch an SEC filing by URL and extract key sections for moat analysis."""
    try:
        result = await extract_filing_sections(req.url, req.filing_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract filing: {str(e)}")


@router.post("/extract-transcript", response_model=ExtractTranscriptResponse)
async def extract_transcript(req: ExtractTranscriptRequest):
    """Segment an earnings call transcript into management commentary and Q&A."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Transcript text is empty")
    result = segment_transcript(req.text)
    return result
