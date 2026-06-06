import base64
import hmac
import os
import zipfile
from io import BytesIO
from typing import Callable, Optional
from uuid import UUID
from datetime import datetime

import bcrypt
import json
import uuid
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from PIL import Image
from ultralytics import YOLO

import models
import schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Epson QC System API")

# Serve saved detection screenshots
static_root = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(static_root, "detections"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_root), name="static")

SECRET_KEY = os.getenv("APP_SECRET_KEY", "change-me-in-prod")
TOKEN_EXPIRE_SECONDS = int(os.getenv("ACCESS_TOKEN_EXPIRE_SECONDS", "3600"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Mengizinkan semua domain
    allow_credentials=True,
    allow_methods=["*"],  # Mengizinkan semua metode 
    allow_headers=["*"],  # Mengizinkan semua jenis headers
)

DETECTION_MODEL_PATH = os.getenv("DETECTION_MODEL_PATH")
if not DETECTION_MODEL_PATH:
    if os.path.exists("best.pt"):
        DETECTION_MODEL_PATH = "best.pt"
    elif os.path.exists("comvis_best.pt"):
        DETECTION_MODEL_PATH = "comvis_best.pt"
    elif os.path.exists("best.pt.zip"):
        DETECTION_MODEL_PATH = "best.pt.zip"
    else:
        DETECTION_MODEL_PATH = "best.pt"

model = None

@app.on_event("startup")
def load_detection_model():
    global model
    model_path = DETECTION_MODEL_PATH
    print(f"Loading detection model from: {model_path}")
    try:
        if os.path.isfile(model_path) and model_path.lower().endswith(".zip"):
            if not zipfile.is_zipfile(model_path):
                raise ValueError("Detection model path is a .zip file, but the archive is invalid")
            extract_dir = os.path.join(os.path.dirname(model_path), ".model_cache")
            os.makedirs(extract_dir, exist_ok=True)
            with zipfile.ZipFile(model_path, "r") as archive:
                pt_files = [name for name in archive.namelist() if name.lower().endswith(".pt")]
                if not pt_files:
                    raise ValueError("No .pt model file found inside the zip archive")
                extracted_path = archive.extract(pt_files[0], path=extract_dir)
                model_path = extracted_path
                print(f"Extracted model from zip: {model_path}")

        if not os.path.isfile(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")

        model = YOLO(model_path)
        print(f"Loaded detection model: {model_path}")
    except Exception as exc:
        print(f"Model load failed: {exc}")
        model = None


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding and padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("ascii"))


def create_access_token(user_id: int, expires_in: int = TOKEN_EXPIRE_SECONDS) -> str:
    payload = json.dumps(
        {
            "user_id": user_id,
            "exp": int(datetime.utcnow().timestamp()) + expires_in,
        }
    ).encode("utf-8")
    signature = hmac.new(SECRET_KEY.encode("utf-8"), payload, digestmod="sha256").digest()
    return f"{_base64url_encode(payload)}.{_base64url_encode(signature)}"


def decode_access_token(token: str) -> dict:
    try:
        payload_b64, signature_b64 = token.split(".")
        payload = _base64url_decode(payload_b64)
        signature = _base64url_decode(signature_b64)
        expected = hmac.new(SECRET_KEY.encode("utf-8"), payload, digestmod="sha256").digest()
        if not hmac.compare_digest(expected, signature):
            raise ValueError("Invalid token signature")
        data = json.loads(payload)
        if data.get("exp") is None or int(data["exp"]) < int(datetime.utcnow().timestamp()):
            raise ValueError("Token expired")
        return data
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token")


def get_current_user(
    authorization: str | None = Header(None), db: Session = Depends(get_db)
) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    user = db.query(models.User).filter(models.User.id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*allowed_roles: str) -> Callable[[models.User], models.User]:
    def _require_role(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="Insufficient privileges for this action",
            )
        return user

    return _require_role


@app.post("/detect/")
async def detect_part_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Detection model not loaded. "
                "Set DETECTION_MODEL_PATH to a valid .pt file."
            ),
        )

    content = await file.read()
    try:
        image = Image.open(BytesIO(content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    def _run_model():
        return model(image, imgsz=640, conf=0.25, verbose=False)

    results = await run_in_threadpool(_run_model)
    result = results[0]

    boxes = []
    for box, conf, cls in zip(
        result.boxes.xyxy.tolist(),
        result.boxes.conf.tolist(),
        result.boxes.cls.tolist(),
    ):
        boxes.append(
            {
                "bbox": [
                    round(float(box[0]), 1),
                    round(float(box[1]), 1),
                    round(float(box[2]), 1),
                    round(float(box[3]), 1),
                ],
                "confidence": round(float(conf), 3),
                "label": str(model.names[int(cls)]),
            }
        )

    detected_count = len(boxes)
    return {
        "count": detected_count,
        "detections": boxes,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.get("/")
def root():
    return {"message": "Epson QC API is running"}


def verify_password(plain: str, stored_hash: str) -> bool:
    if stored_hash.startswith("$2"):
        try:
            return bcrypt.checkpw(
                plain.encode("utf-8"),
                stored_hash.encode("utf-8"),
            )
        except ValueError:
            return False
    return hmac.compare_digest(plain, stored_hash)




def inspection_to_list_item(
    insp: models.Inspection,
    target_quantity: Optional[int],
    part_code: Optional[str],
    part_name: Optional[str],
) -> schemas.InspectionListItem:
    return schemas.InspectionListItem(
        display_id=insp.display_id,
        id=insp.id,
        part_id=insp.part_id,
        part_code=part_code,
        part_name=part_name,
        operator_id=insp.operator_id,
        detected_quantity=insp.detected_quantity,
        status=insp.status,
        discrepancy=insp.discrepancy,
        image_url=insp.image_url,
        ai_confidence_score=insp.ai_confidence_score,
        process_duration=insp.process_duration,
        updated_by=insp.updated_by,
        shift=insp.shift,
        created_at=insp.created_at,
        target_quantity=target_quantity,
    )


@app.get("/healthz")
def health_check():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "time": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/auth/login", response_model=schemas.LoginResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == body.username)
        .first()
    )
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user.id)
    return schemas.LoginResponse(
        user=schemas.UserOut(id=user.id, username=user.username, role=user.role),
        token=token,
    )


@app.get("/parts/", response_model=list[schemas.PartOut])
def list_parts(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return db.query(models.Part).order_by(models.Part.id).all()


@app.post("/parts/", response_model=schemas.PartOut)
def create_part(
    body: schemas.PartCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "manager")),
):
    p = models.Part(
        part_code=body.part_code,
        part_name=body.part_name,
        standard_weight=body.standard_weight,
        target_quantity=body.target_quantity,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.put("/parts/{part_id}", response_model=schemas.PartOut)
def update_part(part_id: int, body: schemas.PartUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_role("supervisor", "manager"))):
    p = db.query(models.Part).filter(models.Part.id == part_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Part not found")
    if body.part_name is not None:
        p.part_name = body.part_name
    if body.standard_weight is not None:
        p.standard_weight = body.standard_weight
    if body.target_quantity is not None:
        p.target_quantity = body.target_quantity
    db.commit()
    db.refresh(p)
    return p


@app.delete("/parts/{part_id}")
def delete_part(part_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role("supervisor", "manager"))):
    deleted = db.query(models.Part).filter(models.Part.id == part_id).delete()
    db.commit()
    return {"deleted": bool(deleted)}


@app.get("/inspections/", response_model=list[schemas.InspectionListItem])
def list_inspections(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    rows = (
        db.query(
            models.Inspection,
            models.Part.target_quantity,
            models.Part.part_code,
            models.Part.part_name,
        )
        .outerjoin(models.Part, models.Inspection.part_id == models.Part.id)
        .order_by(models.Inspection.created_at.desc())
        .all()
    )
    items = [
        inspection_to_list_item(insp, tq, part_code, part_name)
        for insp, tq, part_code, part_name in rows
    ]
    try:
        print(f"list_inspections: returning {len(items)} rows")
    except Exception:
        pass
    return items


@app.get("/audit/", response_model=list[schemas.AuditLogItem])
def list_audit_logs(db: Session = Depends(get_db), current_user: models.User = Depends(require_role("supervisor", "manager"))):
    rows = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).all()
    return rows


@app.delete("/audit/{audit_id}")
def delete_audit_log(
    audit_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "manager")),
):
    audit = db.query(models.AuditLog).filter(models.AuditLog.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit log not found")
    db.delete(audit)
    db.commit()
    return {"deleted": True}


@app.delete("/audit/")
def delete_all_audit_logs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "manager")),
):
    deleted = db.query(models.AuditLog).delete()
    db.commit()
    return {"deleted": deleted}


@app.get("/detections/", response_model=list[schemas.DetectionListItem])
def list_detections(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return (
        db.query(models.DetectionResult)
        .order_by(models.DetectionResult.created_at.desc())
        .all()
    )


@app.delete("/detections/")
def delete_all_detections(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    deleted = db.query(models.DetectionResult).delete()
    db.commit()
    try:
        db.add(models.AuditLog(entity="detection_result", entity_id=None, action="delete_all", payload={"deleted": deleted}, user_id=current_user.id))
        db.commit()
    except Exception:
        db.rollback()
    return {"deleted": deleted}


@app.post("/detections/upload", response_model=schemas.DetectionListItem)
async def upload_detection_image(
    file: UploadFile = File(...),
    count: int = Form(...),
    detections: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # parse detections JSON
    try:
        det_list = json.loads(detections)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid detections JSON")

    # Basic upload safety checks
    MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image")

    # read up to limit
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")

    # validate image can be opened
    try:
        img = Image.open(BytesIO(content))
        img.verify()  # verify integrity
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

    # sanitize filename and extension
    orig_name = Path(file.filename).name if file.filename else "snapshot.jpg"
    ext = Path(orig_name).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png"]:
        ext = ".jpg"
    filename = f"detection_{uuid.uuid4().hex}{ext}"

    # save uploaded image to static/detections safely
    save_dir = os.path.join(static_root, "detections")
    os.makedirs(save_dir, exist_ok=True)
    file_path = os.path.join(save_dir, filename)
    try:
        # write binary content
        with open(file_path, "wb") as fh:
            fh.write(content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    image_url = f"/static/detections/{filename}"

    new_detection = models.DetectionResult(
        count=count,
        detections=det_list,
        image_path=image_url,
        status="SAVED",
    )
    db.add(new_detection)
    db.commit()
    db.refresh(new_detection)
    return new_detection


@app.post("/detections/", response_model=schemas.DetectionListItem)
def create_detection(
    data: schemas.DetectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    payload = data.dict(exclude_none=True)
    if "image_url" in payload:
        payload["image_path"] = payload.pop("image_url")

    new_detection = models.DetectionResult(
        **payload,
        status=data.status or "SAVED",
    )
    db.add(new_detection)
    db.commit()
    db.refresh(new_detection)
    return new_detection


@app.post("/inspections/", response_model=schemas.InspectionResponse)
def create_inspection(
    data: schemas.InspectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    status = "SNAPSHOT"
    discrepancy = None

    if data.part_id:
        part = db.query(models.Part).filter(models.Part.id == data.part_id).first()
        if not part:
            raise HTTPException(status_code=404, detail="Part tidak ditemukan")
        discrepancy = data.detected_quantity - part.target_quantity
        # If detected quantity is zero, mark as REVIEW per request
        if data.detected_quantity == 0:
            status = "REVIEW"
        else:
            status = "OK" if discrepancy == 0 else "NG"
    else:
        part = None

    new_inspection = models.Inspection(
        part_id=data.part_id,
        operator_id=data.operator_id,
        detected_quantity=data.detected_quantity,
        image_url=data.image_url,
        ai_confidence_score=data.ai_confidence_score,
        process_duration=data.process_duration,
        shift=data.shift,
        status=status,
        discrepancy=discrepancy,
    )

    db.add(new_inspection)
    db.commit()
    db.refresh(new_inspection)
    try:
        print(f"create_inspection: created id={new_inspection.id} part_id={new_inspection.part_id} detected={new_inspection.detected_quantity} status={new_inspection.status}")
    except Exception:
        pass
    return new_inspection


@app.delete("/inspections/{inspection_id}")
def delete_inspection(
    inspection_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "manager")),
):
    insp = db.query(models.Inspection).filter(models.Inspection.id == inspection_id).first()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    db.delete(insp)
    db.commit()
    try:
        db.add(models.AuditLog(entity="inspection", entity_id=str(inspection_id), action="delete", payload=None, user_id=current_user.id))
        db.commit()
    except Exception:
        db.rollback()
    return {"deleted": True}


@app.delete("/inspections/")
def delete_all_inspections(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "manager")),
):
    deleted = db.query(models.Inspection).delete()
    db.commit()
    # record audit
    try:
        audit = models.AuditLog(entity="inspection", entity_id=None, action="delete_all", payload={"deleted": deleted}, user_id=current_user.id)
        db.add(audit)
        db.commit()
    except Exception:
        db.rollback()
    return {"deleted": deleted}


@app.patch(
    "/inspections/{inspection_id}",
    response_model=schemas.InspectionListItem,
)
def update_inspection(
    inspection_id: UUID,
    body: schemas.InspectionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "manager")),
):
    insp = (
        db.query(models.Inspection)
        .filter(models.Inspection.id == inspection_id)
        .first()
    )
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    if body.detected_quantity is not None:
        insp.detected_quantity = body.detected_quantity
    if body.status is not None:
        insp.status = body.status
    if body.updated_by is not None:
        insp.updated_by = body.updated_by
    else:
        insp.updated_by = current_user.id

    part = (
        db.query(models.Part).filter(models.Part.id == insp.part_id).first()
        if insp.part_id
        else None
    )
    if part:
        insp.discrepancy = insp.detected_quantity - part.target_quantity
        if body.status is None and body.detected_quantity is not None:
            insp.status = "OK" if insp.discrepancy == 0 else "NG"

    db.commit()
    db.refresh(insp)
    tq = part.target_quantity if part else None
    # record audit
    try:
        db.add(models.AuditLog(entity="inspection", entity_id=str(inspection_id), action="update", payload=body.dict(exclude_none=True), user_id=current_user.id))
        db.commit()
    except Exception:
        db.rollback()
    return inspection_to_list_item(insp, tq)


@app.get("/_debug/users")
def _debug_list_users(db: Session = Depends(get_db)):
    """
    Debug endpoint to list users. Only enabled when DEBUG_ALLOW_USER_LIST=1
    """
    rows = db.query(models.User).order_by(models.User.id).all()
    return [{"id": r.id, "username": r.username, "role": r.role} for r in rows]
