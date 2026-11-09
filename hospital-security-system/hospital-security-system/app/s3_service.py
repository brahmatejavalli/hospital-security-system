"""Private encrypted-object storage; no public S3 URLs or plaintext temporary files."""

import os
import re
from functools import lru_cache
from pathlib import Path
from app.config import AWS_REGION, DATA_DIR, MAX_UPLOAD_BYTES, S3_BUCKET


@lru_cache(maxsize=1)
def s3_client():
    import boto3

    return boto3.client("s3", region_name=AWS_REGION)


def local_path(key: str) -> Path:
    if not re.fullmatch(r"records/[a-f0-9-]{36}\.bin", key):
        raise ValueError("Invalid storage key")
    directory = DATA_DIR / "objects"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    return directory / key.replace("/", "_")


def put_object(key: str, payload: bytes):
    if S3_BUCKET:
        s3_client().put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=payload,
            ContentType="application/octet-stream",
            ServerSideEncryption="AES256",
        )
    else:
        path = local_path(key)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
        except BaseException:
            path.unlink(missing_ok=True)
            raise


def get_object(key: str) -> bytes:
    # Bound even corrupted/externally modified objects before decryption. The
    # envelope adds 32 bytes; one extra byte makes oversized data fail integrity.
    limit = MAX_UPLOAD_BYTES + 33
    if S3_BUCKET:
        body = s3_client().get_object(Bucket=S3_BUCKET, Key=key)["Body"]
        try:
            return body.read(limit)
        finally:
            body.close()
    with local_path(key).open("rb") as handle:
        return handle.read(limit)


def delete_object(key: str):
    if S3_BUCKET:
        s3_client().delete_object(Bucket=S3_BUCKET, Key=key)
    else:
        local_path(key).unlink(missing_ok=True)
