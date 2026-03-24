from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    file_path: str
    status: str
    endpoint_url: str | None = None
    created_at: dt.datetime


class DeployResponse(BaseModel):
    model_id: int = Field(..., ge=1)
    status: str
    endpoint_url: str | None = None

