from __future__ import annotations

import datetime as dt
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import ModelRecord


def create_model_record(
    db: Session, *, name: str, file_path: str, status: str = "uploaded"
) -> ModelRecord:
    rec = ModelRecord(
        name=name,
        file_path=file_path,
        status=status,
        endpoint_url=None,
        created_at=dt.datetime.now(dt.UTC),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def list_models(db: Session) -> Iterable[ModelRecord]:
    return db.execute(select(ModelRecord).order_by(ModelRecord.id.desc())).scalars().all()


def get_model(db: Session, model_id: int) -> ModelRecord | None:
    return db.get(ModelRecord, model_id)


def set_deploying(db: Session, rec: ModelRecord) -> ModelRecord:
    rec.status = "deploying"
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def set_running(db: Session, rec: ModelRecord, *, endpoint_url: str) -> ModelRecord:
    rec.status = "running"
    rec.endpoint_url = endpoint_url
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def set_failed(db: Session, rec: ModelRecord) -> ModelRecord:
    rec.status = "failed"
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec

