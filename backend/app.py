"""
SPECTRA ML Microservice
Exposes a lightweight HTTP API so the Next.js payment flow can trigger
a real-time ML rescore for a single client after a payment is received.

Run:
    pip install fastapi uvicorn
    python app.py           # listens on http://localhost:8000

Endpoints:
    POST /rescore   { "client_id": "12345" }
    GET  /health
"""
import os
import sys
from pathlib import Path

# Make backend/scripts importable
sys.path.insert(0, str(Path(__file__).parent / "scripts"))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rescore_client import rescore

app = FastAPI(title="SPECTRA ML Microservice", version="1.0.0")

_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000",
).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class RescoreRequest(BaseModel):
    client_id: str


@app.get("/health")
def health():
    return {"ok": True, "service": "spectra-ml"}


@app.post("/rescore")
def rescore_client(req: RescoreRequest):
    if not req.client_id.strip():
        raise HTTPException(status_code=400, detail="client_id is required")
    try:
        result = rescore(req.client_id.strip())
        return {"ok": True, **result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import socket
    port = int(os.environ.get("ML_PORT", 8000))
    # If already running on this port, exit cleanly so concurrently doesn't restart it
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            print(f"[SPECTRA ML] Port {port} already in use — assuming service is running, exiting.")
            sys.exit(0)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
