from database import SessionLocal
from models import Part


def ensure_spur_gear():
    db = SessionLocal()
    try:
        existing = db.query(Part).filter(Part.part_code == "SPUR-GEAR-001").first()
        if existing:
            print("Spur gear part already exists:", existing.part_code)
            return
        part = Part(
            part_code="SPUR-GEAR-001",
            part_name="Spur Gear",
            vendor_name="DefaultVendor",
            standard_weight=12.5,
            target_quantity=5,
        )
        db.add(part)
        db.commit()
        print("Created part Spur Gear with target_quantity=5")
    except Exception as e:
        print("Failed to ensure part:", e)
    finally:
        db.close()


if __name__ == "__main__":
    ensure_spur_gear()
