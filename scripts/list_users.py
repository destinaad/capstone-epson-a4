from database import SessionLocal
import models

if __name__ == '__main__':
    db = SessionLocal()
    try:
        users = db.query(models.User).all()
        if not users:
            print('NO_USERS')
        else:
            for u in users:
                print(f'{u.id}\t{u.username}\t{u.role}')
    finally:
        db.close()
