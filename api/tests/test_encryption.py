"""Tests for PII encryption and detection."""

import pytest


def test_encrypt_decrypt_roundtrip(encryption_key):
    from app.services.encryption import encrypt_pii, decrypt_pii

    original = "John Doe Account 12345678"
    encrypted = encrypt_pii(original)
    assert encrypted != original
    assert len(encrypted) > 0

    decrypted = decrypt_pii(encrypted)
    assert decrypted == original


def test_encrypt_empty_string(encryption_key):
    from app.services.encryption import encrypt_pii, decrypt_pii

    assert encrypt_pii("") == ""
    assert decrypt_pii("") == ""


def test_pii_detector_ssn():
    from app.services.pii_detector import detect_pii_in_text

    text = "SSN: 123-45-6789 and account ***-1234"
    findings = detect_pii_in_text(text)
    assert "ssn" in findings
    assert "account_number" in findings


def test_pii_detector_no_pii():
    from app.services.pii_detector import detect_pii_in_text

    text = "Total Account Value: $45,230.18"
    findings = detect_pii_in_text(text)
    assert len(findings) == 0


def test_mask_account_number():
    from app.services.pii_detector import mask_account_number

    assert mask_account_number("12345678") == "***-5678"
    assert mask_account_number("1234") == "1234"
    assert mask_account_number("") == ""
