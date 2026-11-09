import re
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator
from app.config import DEPARTMENTS

Password = Annotated[str, StringConstraints(strip_whitespace=False)]
Role = Literal["admin", "doctor", "nurse", "auditor"]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def validate_password(value: str) -> str:
    if (
        not (12 <= len(value) <= 128)
        or not re.search(r"[a-zA-Z]", value)
        or not re.search(r"[0-9]", value)
    ):
        raise ValueError("Use 12–128 characters, including a letter and a number.")
    return value


class UserLogin(InputModel):
    email: EmailStr
    password: Password = Field(min_length=1, max_length=128)


class UserCreate(InputModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: Password
    role: Role = "nurse"
    department: str = "General Medicine"
    _password = field_validator("password")(validate_password)

    @field_validator("department")
    @classmethod
    def department_exists(cls, value):
        if value not in DEPARTMENTS:
            raise ValueError("Choose a supported department.")
        return value


class UserUpdate(InputModel):
    role: Role | None = None
    is_active: bool | None = None
    department: str | None = None

    @field_validator("department")
    @classmethod
    def department_exists(cls, value):
        if value is not None and value not in DEPARTMENTS:
            raise ValueError("Choose a supported department.")
        return value


class ProfileUpdate(InputModel):
    username: str = Field(min_length=2, max_length=100)


class PasswordUpdate(InputModel):
    current_password: Password = Field(min_length=1, max_length=128)
    new_password: Password
    _password = field_validator("new_password")(validate_password)


class AdminPasswordReset(InputModel):
    new_password: Password
    _password = field_validator("new_password")(validate_password)


class SettingsUpdate(InputModel):
    name: str = Field(min_length=2, max_length=100)
    contact_email: EmailStr
    timezone: str
    session_minutes: Literal[15, 30, 60, 120, 480]

    @field_validator("timezone")
    @classmethod
    def timezone_exists(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Choose a valid IANA timezone.")
        return value


class AlertResolution(InputModel):
    note: str = Field(
        default="Reviewed and resolved by an administrator.", min_length=3, max_length=1000
    )
