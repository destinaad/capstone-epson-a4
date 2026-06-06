# Epson QC System

## Persiapan lingkungan

### Backend
1. Buka terminal di folder proyek:
   ```powershell
   cd "c:\Users\LENOVO\Downloads\capstone-epson-main\capstone-epson-main"
   ```
2. Buat virtual environment dan aktifkan:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
3. Install dependency:
   ```powershell
   pip install -r requirements.txt
   ```

### Konfigurasi Database (Supabase Cloud)

Proyek ini menggunakan **Supabase Cloud** sebagai database utama. Tim tidak perlu lagi menjalankan kontainer PostgreSQL lokal menggunakan Docker Desktop maupun pgAdmin.

### Pengaturan File `.env`
Sistem backend saat ini dikonfigurasi untuk membaca variabel lingkungan tunggal bernama `DATABASE_URL`. Buat atau ubah file `.env` di root direktori proyek, lalu isi dengan format berikut:

```text
DATABASE_URL=postgresql://postgres.vtnixgypflpgjxpkfcdw:[PASSWORD_SUPABASE_ANDA]@[aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres](https://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres)

## Struktur database

Tabel utama yang digunakan oleh aplikasi:
- `parts`: master data komponen dengan `part_code`, `part_name`, `standard_weight`, `target_quantity`.
- `users`: akun pengguna dengan `username`, `password_hash`, dan `role`.
- `inspections`: hasil inspeksi dengan UUID, `part_id`, `operator_id`, `detected_quantity`, `status`, `discrepancy`, `image_url`, `ai_confidence_score`, `process_duration`, `shift`, `created_at`.
- `audit_logs`: catatan aktivitas untuk perubahan entitas.
- `detection_results`: hasil deteksi AI dengan `count`, `detections`, `image_path`, `status`, `created_at`.

Skema ini dibuat oleh SQLAlchemy saat backend dijalankan. Alembic juga tersedia untuk migrasi jika diperlukan.

## Menjalankan backend

Jika Anda menggunakan file model `.pt`, letakkan file tersebut di root proyek dengan nama `best.pt`.

Jika Anda menggunakan file ZIP yang berisi model `.pt`, letakkan file tersebut di root proyek dengan nama `best.pt.zip`.

Pada terminal yang sudah aktif venv di root proyek:
```powershell
set POSTGRES_PORT=5433
set DETECTION_MODEL_PATH=best.pt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Jika Anda menggunakan ZIP:
```powershell
set POSTGRES_PORT=5433
set DETECTION_MODEL_PATH=best.pt.zip
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend akan memuat `best.pt` langsung, atau mengekstrak `.pt` dari `best.pt.zip` jika diperlukan.

Backend akan tersedia di `http://localhost:8000`.

## Menjalankan frontend + backend bersamaan (Windows)

Untuk kenyamanan, ada skrip PowerShell `start-all.ps1` di root proyek yang membuka dua jendela PowerShell: satu untuk backend, satu untuk frontend.

Jalankan dari project root (klik kanan -> Run with PowerShell atau lewat PowerShell):

```powershell
Set-Location "C:\Users\LENOVO\Downloads\capstone-epson-main\capstone-epson-main"
.\start-all.ps1
```

Catatan: skrip menggunakan `pwsh` (PowerShell Core) jika tersedia, dan membuka proses dengan `-NoExit` sehingga Anda dapat melihat log server. Sesuaikan `DETECTION_MODEL_PATH` di dalam skrip atau set env var sebelumnya jika perlu.

## Menjalankan frontend

Buka terminal baru di folder `frontend`:
```powershell
cd "c:\Users\LENOVO\Downloads\capstone-epson-main\capstone-epson-main\frontend"
set REACT_APP_API_URL=http://localhost:8000
npm start
```

Frontend akan tersedia di `http://localhost:3000`.

## Catatan Penting Pengoperasian

* **Koneksi Terpusat:** Baik backend yang dijalankan di laptop Anda maupun di laptop anggota tim lain akan otomatis membaca dan menyimpan data ke kluster **Supabase Cloud** yang sama, asalkan file `.env` dikonfigurasi dengan benar.
* **Tanpa Docker Desktop:** Anda tidak perlu lagi mengaktifkan service PostgreSQL lewat Docker, sehingga menghemat konsumsi RAM dan baterai laptop selama masa pengembangan.
* **Sinkronisasi Frontend & Backend:** Pastikan backend dijalankan terlebih dahulu pada port `8000` sebelum mengaktifkan frontend React agar integrasi API berjalan mulus.

---

## Manajemen Akun Operator (CLI)

Untuk menambahkan akun pengguna (operator/admin) baru ke database cloud tanpa melalui endpoint publik, gunakan skrip CLI aman di terminal root proyek Anda. 

Karena password di sistem ini menggunakan enkripsi hash, **sangat tidak disarankan** menginput password polos langsung via Table Editor di web Supabase.

### Cara Menambahkan User:
Pastikan virtual environment `.venv` Anda sudah aktif, lalu jalankan perintah berikut di terminal:

```powershell
.\.venv\Scripts\python.exe scripts\add_user.py operator1 password123 --role operator
