from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import os
import re

from app.routers import fretboard, tunings, scales, chords, agent

app = FastAPI(
    title="Guitar Tutor API",
    description="Backend for Guitar Tutor App - music theory calculations",
    version="1.0.0",
)

# Configure CORS origins via environment variable so hosted frontends can be allowed.
# Set ALLOWED_ORIGINS as a comma-separated list, e.g.:
#   ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173
allowed_origins_env = os.getenv('ALLOWED_ORIGINS')
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(',') if o.strip()]
else:
    # sensible default for local dev
    allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

# Regex patterns for dynamic origins (like Vercel preview deployments)
# Matches: https://guitar-tutor-*.vercel.app and https://*-david-montes-de-ocas-projects.vercel.app
origin_patterns = [
    re.compile(r'^https://guitar-tutor-.*\.vercel\.app$'),
    re.compile(r'^https://.*-david-montes-de-ocas-projects\.vercel\.app$'),
]

def is_origin_allowed(origin: str) -> bool:
    """Check if origin is in allowed list or matches a pattern."""
    if origin in allowed_origins:
        return True
    for pattern in origin_patterns:
        if pattern.match(origin):
            return True
    return False

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """Custom CORS middleware that supports regex patterns for origins."""
    
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        
        # Handle preflight requests
        if request.method == "OPTIONS":
            response = await call_next(request)
            if origin and is_origin_allowed(origin):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Allow-Methods"] = "*"
                response.headers["Access-Control-Allow-Headers"] = "*"
            return response
        
        response = await call_next(request)
        
        if origin and is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        return response

# Use custom CORS middleware for dynamic origin matching
app.add_middleware(DynamicCORSMiddleware)

# Also add standard CORS middleware for static origins (as fallback)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(fretboard.router, prefix="/api", tags=["fretboard"])
app.include_router(tunings.router, prefix="/api", tags=["tunings"])
app.include_router(scales.router, prefix="/api", tags=["scales"])
app.include_router(chords.router, prefix="/api", tags=["chords"])
app.include_router(agent.router, prefix="/api", tags=["agent"])


@app.get("/")
async def root():
    return {"message": "Guitar Tutor API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
