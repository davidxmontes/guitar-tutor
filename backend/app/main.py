from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import DynamicCORSMiddleware, get_settings, setup_logging
from app.exceptions import register_exception_handlers
from app.routers import fretboard, tunings, scales, chords, agent, songs

setup_logging()

app = FastAPI(
    title="Guitar Tutor API",
    description="Backend for Guitar Tutor App - music theory calculations",
    version="1.0.0",
)

register_exception_handlers(app)

# CORS
settings = get_settings()
app.add_middleware(DynamicCORSMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(fretboard.router, prefix="/api", tags=["fretboard"])
app.include_router(tunings.router, prefix="/api", tags=["tunings"])
app.include_router(scales.router, prefix="/api", tags=["scales"])
app.include_router(chords.router, prefix="/api", tags=["chords"])
app.include_router(agent.router, prefix="/api", tags=["agent"])
app.include_router(songs.router, prefix="/api", tags=["songs"])


@app.get("/")
async def root():
    return {"message": "Guitar Tutor API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
