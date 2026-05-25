import boto3

from app.config import (
    AWS_ACCESS_KEY,
    AWS_SECRET_KEY,
    AWS_BUCKET_NAME,
    AWS_REGION
)

s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION
)

def upload_file_to_s3(file_path, file_name):
    s3.upload_file(file_path, AWS_BUCKET_NAME, file_name)

    return f"https://{AWS_BUCKET_NAME}.s3.amazonaws.com/{file_name}"
