"""Versioned, authenticated encryption. The record UUID is authenticated as AAD."""

import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import ENCRYPTION_KEY_BYTES

MAGIC = b"MG01"


def encrypt_data(data: bytes, record_id: str) -> bytes:
    nonce = os.urandom(12)
    return MAGIC + nonce + AESGCM(ENCRYPTION_KEY_BYTES).encrypt(nonce, data, record_id.encode())


def decrypt_data(payload: bytes, record_id: str, expected_hash: str) -> bytes:
    if not payload.startswith(MAGIC) or len(payload) < 32:
        raise ValueError("Invalid encrypted file envelope")
    plaintext = AESGCM(ENCRYPTION_KEY_BYTES).decrypt(
        payload[4:16], payload[16:], record_id.encode()
    )
    if not hmac.compare_digest(generate_sha3(plaintext), expected_hash):
        raise ValueError("SHA3-256 integrity mismatch")
    return plaintext


def generate_sha3(data: bytes) -> str:
    return hashlib.sha3_256(data).hexdigest()
