from sqlalchemy import Column, Integer, String, Float, ForeignKey, TIMESTAMP, text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
from sqlalchemy import DateTime

class Part(Base):
    __tablename__ = "parts"
    id = Column(Integer, primary_key=True, index=True)
    part_code = Column(String, unique=True, nullable=False)
    part_name = Column(String, nullable=False)
    vendor_name = Column(String)
    standard_weight = Column(Float, nullable=False)
    target_quantity = Column(Integer, nullable=False)

    inspections = relationship(
        "Inspection",
        back_populates="part",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)

class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"))
    operator_id = Column(Integer, ForeignKey("users.id"))
    detected_quantity = Column(Integer, nullable=False)
    status = Column(String)  # OK atau NG
    discrepancy = Column(Integer)
    image_url = Column(String)
    ai_confidence_score = Column(Float)
    process_duration = Column(Float)
    updated_by = Column(Integer, ForeignKey("users.id"))
    shift = Column(Integer)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

    part = relationship("Part", back_populates="inspections")
    
    @property
    def display_id(self) -> str:
        """Human-friendly short id for UI (not stored in DB).
        Example: '230528-1a2b3c4d' using date + first 8 chars of UUID.
        """
        try:
            ts = self.created_at
            date_part = ts.strftime("%y%m%d") if ts else ''
        except Exception:
            date_part = ''
        short_uuid = str(self.id)[:8] if self.id is not None else ''
        if date_part:
            return f"{date_part}-{short_uuid}"
        return short_uuid


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    entity = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    action = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

class DetectionResult(Base):
    __tablename__ = "detection_results"
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    count = Column(Integer, nullable=False)
    detections = Column(JSON, nullable=False)
    image_path = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

    @property
    def image_url(self):
        return self.image_path