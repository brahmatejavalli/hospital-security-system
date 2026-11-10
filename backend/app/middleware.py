"""Bound the incoming body before multipart parsing or plaintext disk spooling."""

from starlette.formparsers import MultiPartParser
from starlette.responses import JSONResponse
from app.config import MAX_UPLOAD_BYTES

REQUEST_LIMIT = MAX_UPLOAD_BYTES + 64 * 1024
# The bounded request stays in memory until encryption, rather than spilling
# plaintext uploads to Starlette's default 1 MB temporary-file threshold.
MultiPartParser.spool_max_size = REQUEST_LIMIT + 1


class RequestSizeLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            declared_length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)(
                scope, receive, send
            )
        if declared_length > REQUEST_LIMIT:
            return await self.reject(scope, receive, send)
        # Buffer no more than the bound. Validate unknown-length/chunked uploads
        # before invoking body parsers, which can otherwise mask receive errors.
        chunks = []
        consumed = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            consumed += len(chunk)
            if consumed > REQUEST_LIMIT:
                return await self.reject(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        chunks.clear()
        delivered = False

        async def buffered_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, buffered_receive, send)

    async def reject(self, scope, receive, send):
        response = JSONResponse(
            {"detail": "Request too large. The maximum file size is 10 MB."},
            status_code=413,
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
        await response(scope, receive, send)
