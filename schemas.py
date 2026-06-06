from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class InspectionCreate(BaseModel):
    part_id: Optional[int] = None
    operator_id: int
    detected_quantity: int
    image_url: Optional[str] = None
    ai_confidence_score: Optional[float] = None
    process_duration: Optional[float] = None
    shift: int


class InspectionResponse(BaseModel):
    id: UUID
    display_id: Optional[str] = None
    status: str
    discrepancy: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InspectionListItem(BaseModel):
    id: UUID
    display_id: Optional[str] = None
    part_id: Optional[int] = None
    part_code: Optional[str] = None
    part_name: Optional[str] = None
    operator_id: Optional[int] = None
    detected_quantity: int
    status: Optional[str] = None
    discrepancy: Optional[int] = None
    image_url: Optional[str] = None
    ai_confidence_score: Optional[float] = None
    process_duration: Optional[float] = None
    updated_by: Optional[int] = None
    shift: Optional[int] = None
    created_at: datetime
    target_quantity: Optional[int] = None

    class Config:
        from_attributes = True


class InspectionUpdate(BaseModel):
    detected_quantity: Optional[int] = None
    status: Optional[str] = None
    updated_by: Optional[int] = None


class DetectionCreate(BaseModel):
    count: int
    detections: list[dict]
    status: Optional[str] = None
    image_url: Optional[str] = None


class DetectionListItem(BaseModel):
    id: UUID
    count: int
    detections: list[dict]
    status: Optional[str] = None
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PartOut(BaseModel):
    id: int
    part_code: str
    part_name: str
    standard_weight: float
    target_quantity: int

    class Config:
        from_attributes = True


class PartCreate(BaseModel):
    part_code: str
    part_name: str
    standard_weight: float
    target_quantity: int


class PartUpdate(BaseModel):
    part_name: Optional[str] = None
    standard_weight: Optional[float] = None
    target_quantity: Optional[int] = None


class AuditLogItem(BaseModel):
    id: UUID
    entity: str
    entity_id: Optional[str] = None
    action: str
    payload: Optional[dict] = None
    user_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    user: UserOut
    token: str
