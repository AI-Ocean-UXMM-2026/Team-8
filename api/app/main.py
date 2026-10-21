"""Application composition only. Domain rules live in feature services."""
from .core.application import create_app

app = create_app()
