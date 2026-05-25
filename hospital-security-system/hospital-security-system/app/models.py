from sqlalchemy import Column, Integer, String
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True)
    email = Column(String(100), unique=True)
    password = Column(String(255))

class FileData(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True)
    filename = Column(String(255))
    hash_value = Column(String(255))
