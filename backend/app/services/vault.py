"""Symmetric encryption for secrets at rest (e.g. the SAP password).

The key comes from the PEMS_SECRET_KEY env var, or a local key file that is
generated once and kept out of git. Stored ciphertexts are prefixed with 'enc:'
so legacy plaintext values still decrypt (returned as-is) during migration.
"""
from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

_ENV = "PEMS_SECRET_KEY"
_KEY_FILE = Path(__file__).resolve().parents[2] / ".pems_secret.key"  # backend/.pems_secret.key
_PREFIX = "enc:"
_fernet: Fernet | None = None


def _key() -> bytes:
    env = os.environ.get(_ENV)
    if env:
        return env.encode()
    if _KEY_FILE.exists():
        return _KEY_FILE.read_bytes().strip()
    key = Fernet.generate_key()
    _KEY_FILE.write_bytes(key)
    try:
        os.chmod(_KEY_FILE, 0o600)
    except OSError:
        pass
    return key


def _f() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_key())
    return _fernet


def encrypt(plain: str | None) -> str:
    if not plain:
        return ""
    return _PREFIX + _f().encrypt(plain.encode()).decode()


def decrypt(stored: str | None) -> str:
    if not stored:
        return ""
    if not stored.startswith(_PREFIX):
        return stored  # legacy plaintext — kept working during migration
    try:
        return _f().decrypt(stored[len(_PREFIX):].encode()).decode()
    except InvalidToken:
        return ""
