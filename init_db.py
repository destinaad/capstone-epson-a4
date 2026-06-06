import os

from dotenv import load_dotenv
from database import Base, engine
import models

load_dotenv()

print("=" * 50)
print(" 🔎 MEMERIKSA KONFIGURASI ENVIRONMENT .ENV...")
database_url = os.getenv("DATABASE_URL", "")

if database_url:
    # Mask password in log output
    safe_url = database_url.split("@")[-1] if "@" in database_url else "(hidden)"
    print(f"-> DATABASE_URL host/path: ...@{safe_url}")
else:
    print("-> DATABASE_URL yang terbaca: (kosong)")
print("=" * 50)

if database_url and "supabase" in database_url:
    print("🚀 KONFIRMASI: Jalur terdeteksi resmi mengarah ke SUPABASE CLOUD!")
else:
    print("⚠️ PERINGATAN: Jalur masih mengarah ke LOCALHOST / KOSONG!")
print("=" * 50)

print("Memulai pembuatan struktur tabel...")
try:
    Base.metadata.create_all(bind=engine)
    print("\n✨ PROSES SELESAI! Silakan cek web Supabase kamu sekarang!")
except Exception as e:
    print(f"\n❌ Waduh gagal karena: {e}")
print("=" * 50)
