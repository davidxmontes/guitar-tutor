"""OTEL setup — call setup_telemetry() once from main.py before the app starts."""

import base64
import logging

logger = logging.getLogger(__name__)


def setup_telemetry() -> None:
    """Configure OTEL TracerProvider and instrument FastAPI. No-ops if not configured."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.otel_exporter_otlp_endpoint:
        logger.info("OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled")
        return

    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        logger.info("Langfuse keys not set — telemetry disabled")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        auth = base64.b64encode(
            f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
        ).decode()

        exporter = OTLPSpanExporter(
            endpoint=settings.otel_exporter_otlp_endpoint,
            headers={"Authorization": f"Basic {auth}"},
        )
        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        logger.info("OTEL TracerProvider configured → %s", settings.otel_exporter_otlp_endpoint)
    except Exception as exc:
        logger.warning("Failed to configure OTEL: %s", exc)
