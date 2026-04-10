"""Pytest fixtures for the API test suite."""

import os
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models import Base


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")

    # Enable WAL mode and foreign keys
    @event.listens_for(engine, "connect")
    def set_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    yield session

    session.close()


@pytest.fixture
def encryption_key():
    """Set a test encryption key."""
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    os.environ["ENCRYPTION_KEY"] = key
    yield key
    # Reset the cached fernet instance
    from app.services import encryption
    encryption._fernet = None
