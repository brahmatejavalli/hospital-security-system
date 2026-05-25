from fastapi import FastAPI

from app.database import Base, engine
from app.routes.user_routes import router as user_router
from app.routes.file_routes import router as file_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Hospital Security System")

app.include_router(user_router, prefix="/user", tags=["User"])
app.include_router(file_router, prefix="/file", tags=["File"])

@app.get("/")
def home():
    return {"message": "Hospital Security System Running"}
