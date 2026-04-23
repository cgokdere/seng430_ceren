from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import os
import json
import httpx

router = APIRouter(prefix="/api/ai-advisor", tags=["ai-advisor"])

@router.post("")
async def get_ai_recommendation(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    domain = body.get("domain", "Unknown")
    metrics = body.get("metrics", [])
    
    if not metrics:
        raise HTTPException(status_code=400, detail="No model metrics provided")
        
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set on the server")
        
    # Construct prompt
    system_prompt = (
        "You are a clinical AI advisor. Analyze ML model performance metrics and recommend the best model "
        "for clinical use. Focus on sensitivity (missing real cases is dangerous), explain in plain English "
        "for healthcare professionals. Keep response under 200 words."
    )
    
    user_prompt = f"Domain: {domain}\n\nMetrics:\n"
    for m in metrics:
        user_prompt += json.dumps(m, indent=2) + "\n"
        
    # Prepare Groq API call
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": True,
        "temperature": 0.3,
        "max_tokens": 300
    }
    
    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    # Check for errors
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {{\"error\": \"Groq API Error: {response.status_code}\"}}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line:
                            yield f"{line}\n"
        except Exception as e:
             yield f"data: {{\"error\": \"Streaming exception: {str(e)}\"}}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
