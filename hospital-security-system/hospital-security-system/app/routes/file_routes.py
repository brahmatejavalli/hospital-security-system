from fastapi import APIRouter, UploadFile, File
from app.encryption import encrypt_data, generate_sha3

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()

    encrypted = encrypt_data(content)
    hash_value = generate_sha3(content)

    return {
        "message": "File encrypted successfully",
        "encrypted": encrypted,
        "hash": hash_value
    }
