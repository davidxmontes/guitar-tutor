from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import fretboard, tunings, scales, chords, agent

app = FastAPI(
    title="Guitar Tutor API",
    description="Backend for Guitar Tutor App - music theory calculations",
    version="1.0.0",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
