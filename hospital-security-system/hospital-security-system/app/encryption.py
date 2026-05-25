from Crypto.Cipher import AES
import hashlib
import base64

KEY = hashlib.sha256(b"hospital_secret").digest()

def encrypt_data(data: bytes):
    cipher = AES.new(KEY, AES.MODE_EAX)

    ciphertext, tag = cipher.encrypt_and_digest(data)

    return {
        "nonce": base64.b64encode(cipher.nonce).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "tag": base64.b64encode(tag).decode()
    }

def generate_sha3(data: bytes):
    return hashlib.sha3_256(data).hexdigest()
