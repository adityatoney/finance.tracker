"""Fernet symmetric encryption for PII fields."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.encryption_key
        if not key:
            raise RuntimeError(
                "ENCRYPTION_KEY not set. Generate one with: "
                'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_pii(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns base64-encoded Fernet token."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_pii(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted string back to plaintext.

    Raises:
        InvalidToken: If the ciphertext is corrupted or the key is wrong.
    """
    if not ciphertext:
        return ""
    return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
