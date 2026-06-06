# Epson QC System — Dokumentasi Arsitektur

Dokumen ini merangkum analisis arsitektur lengkap project **Epson Smart Quality Control** — sistem QC berbasis computer vision untuk menghitung jumlah komponen manufaktur (misalnya spur gear) dari kamera live, membandingkannya dengan target, dan mencatat hasil inspeksi.

---

## Daftar Isi

1. [Ringkasan Arsitektur Sistem](#1-ringkasan-arsitektur-sistem)
2. [Dashboard — Cara Kerja End-to-End](#2-dashboard--cara-kerja-end-to-end)
3. [Computer Vision, Machine Learning, dan AI](#3-computer-vision-machine-learning-dan-ai)
4. [Diagram Arsitektur](#4-diagram-arsitektur)

---

# 1. Ringkasan Arsitektur Sistem

## 1.1 Tujuan Aplikasi

Aplikasi **Epson Smart Quality Control** membantu tim produksi melakukan:

| Fungsi | Penjelasan |
|--------|------------|
| **Deteksi otomatis** | Menghitung jumlah part dari webcam menggunakan model YOLO |
| **Inspeksi QC** | Mencatat hasil inspeksi, membandingkan jumlah terdeteksi vs target part |
| **Pelacakan status** | Menandai OK (sesuai target), NG (selisih), atau REVIEW (confidence rendah / jumlah 0) |
| **Manajemen part** | Supervisor/manager mengelola master data part dan target quantity |
| **Audit trail** | Mencatat perubahan/hapus data oleh supervisor/manager |
| **Dashboard performa** | Manager melihat grafik OK vs NG per shift |

Sistem dirancang untuk tiga peran:

- **Operator** — inspeksi harian via kamera live
- **Supervisor** — validasi, manajemen part, audit
- **Manager** — overview read-only (grafik performa)

---

## 1.2 Teknologi dan Framework

### Backend

| Teknologi | Peran |
|-----------|-------|
| **Python 3.12** | Bahasa utama backend |
| **FastAPI** | REST API framework |
| **Uvicorn** | ASGI server |
| **SQLAlchemy** | ORM database |
| **PostgreSQL 15** | Database relasional |
| **Alembic** | Migrasi schema DB |
| **Ultralytics YOLO** | Model deteksi objek (`.pt`) |
| **Pillow** | Validasi & pemrosesan gambar |
| **bcrypt** | Hash password |
| **Pydantic** | Validasi request/response |

### Frontend

| Teknologi | Peran |
|-----------|-------|
| **React 19** | UI library |
| **Create React App** (`react-scripts`) | Build tooling |
| **React Router v6** | Routing SPA |
| **Axios** | HTTP client ke API |
| **Tailwind CSS** | Styling |
| **Recharts** | Grafik performa |
| **Lucide React** | Ikon |

### Infrastruktur

| Teknologi | Peran |
|-----------|-------|
| **Docker Compose** | Orkestrasi postgres + backend + frontend + pgAdmin |
| **Nginx** | Serve frontend production build |
| **PowerShell scripts** | `start-all.ps1` / `stop-all.ps1` untuk dev lokal (Windows) |

---

## 1.3 Struktur Folder Utama

```
capstone-a4-kel1-main/
├── main.py              # Entry point backend: API routes + YOLO inference
├── models.py            # SQLAlchemy ORM models (Part, User, Inspection, dll.)
├── schemas.py           # Pydantic DTO untuk validasi API
├── database.py          # Koneksi PostgreSQL & session factory
├── requirements.txt     # Dependency Python
├── alembic/             # Migrasi database (versions/)
├── alembic.ini          # Konfigurasi Alembic
├── scripts/             # Utility CLI (add user, add part, list users)
├── static/              # File statis (screenshot deteksi di static/detections/)
├── docker-compose.yml   # Stack lengkap untuk deployment lokal
├── Dockerfile           # Image backend Python
├── start-all.ps1        # Jalankan backend + frontend (Windows)
├── stop-all.ps1         # Hentikan proses dev
├── docs/                # Dokumentasi project
└── frontend/
    ├── src/
    │   ├── index.js         # Entry point React
    │   ├── App.js           # Routing utama
    │   ├── api/client.js    # Axios instance + auth interceptor
    │   ├── context/         # AuthContext (state login global)
    │   ├── components/      # UI reusable (VisionCamera, Layout, dll.)
    │   ├── pages/           # Halaman per fitur
    │   ├── hooks/           # Custom hooks data fetching
    │   └── utils/           # Helper role-based access
    ├── package.json
    ├── Dockerfile           # Build React → Nginx
    └── tailwind.config.js
```

**Fungsi ringkas per folder:**

| Folder | Fungsi |
|--------|--------|
| **Root (`main.py`, `models.py`, …)** | Logika bisnis & API backend (monolitik) |
| **`frontend/src/pages/`** | Satu halaman = satu fitur (Login, Dashboard, Inspections, dll.) |
| **`frontend/src/components/`** | Komponen UI yang dipakai ulang, termasuk kamera live |
| **`frontend/src/hooks/`** | Abstraksi polling/fetch data dari API |
| **`frontend/src/context/`** | State autentikasi global |
| **`alembic/`** | Evolusi schema database secara terkontrol |
| **`scripts/`** | Tool operasional (seed user/part, debug login) |
| **`static/`** | Penyimpanan gambar hasil deteksi yang di-serve backend |

---

## 1.4 Entry Point Aplikasi

### Backend

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

File: `main.py` — membuat instance `FastAPI`, load model YOLO saat startup, mount static files, dan mendaftarkan semua endpoint.

### Frontend (development)

```powershell
cd frontend
npm start   # default port 3000
```

File: `frontend/src/index.js` → render `<App />` ke DOM.

### Frontend (production via Docker)

Build React → serve static via **Nginx** di port 80 (mapped ke 3000 di `docker-compose.yml`).

### Dev cepat (Windows)

`start-all.ps1` membuka 2 terminal: backend (port 8000) + frontend (port 3000), dengan env:

- `POSTGRES_PORT=5433`
- `DETECTION_MODEL_PATH=best.pt`
- `REACT_APP_API_URL=http://localhost:8000`

---

## 1.5 Alur Kerja Sistem Secara Keseluruhan

```
[Operator Login]
      │
      ▼
[Dashboard / VisionCamera]
      │
      ├─► Webcam capture frame (setiap ~1.4 detik)
      │
      ├─► POST /detect/  ──► YOLO inference ──► count + bounding boxes
      │
      ├─► Tampilkan overlay deteksi di browser
      │
      ├─► (Opsional) Autosave jika count stabil 3 detik
      │         │
      │         ▼
      │   POST /detections/upload  ──► simpan gambar ke static/detections/
      │         │
      │         ▼
      │   POST /inspections/  ──► bandingkan vs target_quantity part
      │         │
      │         ▼
      │   Status: OK | NG | REVIEW | SNAPSHOT
      │
      ▼
[Inspections Page] polling GET /inspections/ setiap 5–12 detik
      │
      ├─► Supervisor: edit/hapus inspeksi, validasi NG
      ├─► Manager: lihat Performance (grafik OK vs NG per shift)
      └─► Audit log tercatat saat update/delete
```

**Logika status inspeksi** (di backend `create_inspection`):

- Jika `detected_quantity == 0` → **REVIEW**
- Jika selisih dengan `target_quantity` = 0 → **OK**
- Jika selisih ≠ 0 → **NG**
- Confidence AI < 65% di frontend → ditandai **REVIEW**

---

## 1.6 Hubungan Antar Komponen Utama

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React SPA)                      │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │ AuthCtx  │  │ VisionCamera│  │ Pages (Inspections,    │  │
│  │          │  │ (webcam)    │  │  Parts, Audit, Perf)   │  │
│  └────┬─────┘  └──────┬──────┘  └───────────┬────────────┘  │
│       │               │                      │               │
│       └───────────────┴──────────────────────┘               │
│                       │ axios (Bearer token)                 │
└───────────────────────┼─────────────────────────────────────┘
                        │ HTTP REST (JSON + multipart)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND (FastAPI - main.py)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Auth     │  │ CRUD API │  │ YOLO     │  │ Static     │ │
│  │ (HMAC    │  │ parts,   │  │ /detect/ │  │ /static/   │ │
│  │  token)  │  │ inspect, │  │          │  │ detections │ │
│  │          │  │ audit    │  │          │  │            │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────────┘ │
│       │             │             │                          │
│       └─────────────┴─────────────┘                          │
│                     │ SQLAlchemy ORM                         │
└─────────────────────┼────────────────────────────────────────┘
                      ▼
              ┌───────────────┐
              │  PostgreSQL   │
              │  (epson_qc)   │
              └───────────────┘
```

**Entitas database dan relasinya:**

| Model | Relasi |
|-------|--------|
| **Part** | 1 Part → banyak Inspection |
| **User** | Operator pada Inspection; user_id di AuditLog |
| **Inspection** | FK ke Part & User; menyimpan hasil QC |
| **DetectionResult** | Snapshot deteksi AI (count, bbox JSON, image path) |
| **AuditLog** | Jejak perubahan administratif |

---

## 1.7 Pola Arsitektur yang Digunakan

| Pola | Implementasi di project ini |
|------|------------------------------|
| **Client-Server** | React SPA ↔ FastAPI REST API |
| **Component-Based Architecture** | Frontend diorganisir per komponen, halaman, dan hooks |
| **Layered / 3-tier (ringan)** | Presentation (React) → Application/API (FastAPI) → Data (PostgreSQL) |
| **Monolithic Backend** | Semua route & logik bisnis ada di `main.py` (bukan microservices) |
| **RBAC (Role-Based Access Control)** | Role: `operator`, `supervisor`, `manager` — enforced di backend (`require_role`) dan frontend (`utils/roles.js`) |
| **Repository-like (parsial)** | SQLAlchemy ORM + session via `get_db()` dependency injection FastAPI |
| **DTO Pattern** | Pydantic schemas (`schemas.py`) memisahkan model DB dari response API |

**Bukan** Clean Architecture penuh — backend cukup flat (route handler langsung akses DB). **Bukan** MVC klasik — lebih mendekati **SPA + REST API + ORM**.

---

## 1.8 Integrasi dengan API, Database, Model AI, dan Layanan Eksternal

### Database — PostgreSQL

- Default: `localhost:5433`, DB `epson_qc`, user `postgres`
- Konfigurasi via env: `DATABASE_URL` atau `POSTGRES_*`
- Extension: `uuid-ossp` untuk UUID primary key
- Schema dibuat via `Base.metadata.create_all()` + migrasi Alembic

### Model AI — YOLO (lokal, bukan cloud API)

- File model: `best.pt` (atau `comvis_best.pt`, atau `.zip` berisi `.pt`)
- Env: `DETECTION_MODEL_PATH`
- Library: **Ultralytics YOLO**
- Endpoint: `POST /detect/` — terima gambar, return count + bounding boxes
- Inference di thread pool agar tidak memblokir event loop async

### Penyimpanan file

- Screenshot disimpan di `static/detections/`
- Di-serve via FastAPI StaticFiles mount `/static`

### Autentikasi (custom, bukan JWT library)

- Login: `POST /auth/login` → HMAC-SHA256 signed token (bukan JWT standar)
- Token disimpan di `sessionStorage` frontend
- Header: `Authorization: Bearer <token>`

### Layanan eksternal lain

| Layanan | Digunakan? |
|---------|------------|
| Cloud AI (OpenAI, Google Vision, dll.) | **Tidak** |
| Webcam browser (`getUserMedia`) | **Ya** — hanya di client |
| pgAdmin (Docker) | **Opsional** — admin DB di port 5050 |

### API Endpoints utama

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/auth/login` | Login |
| POST | `/detect/` | Inferensi YOLO |
| GET/POST/PUT/DELETE | `/parts/` | CRUD master part |
| GET/POST/PATCH/DELETE | `/inspections/` | CRUD inspeksi QC |
| GET/POST/DELETE | `/detections/` | Riwayat deteksi + upload gambar |
| GET/DELETE | `/audit/` | Audit log |
| GET | `/healthz` | Health check + status model |

---

## 1.9 Dependency Penting

### Backend (`requirements.txt`)

```
fastapi
uvicorn[standard]
sqlalchemy
psycopg2-binary
pydantic
bcrypt
pillow
python-multipart
ultralytics
alembic
```

### Frontend (`package.json` — production)

```
react, react-dom, react-router-dom, axios,
recharts, lucide-react, tailwindcss, tailwindcss-animate
```

### Dependency implisit penting

- **Ultralytics** membawa PyTorch sebagai dependency transitif (model YOLO)
- **Create React App** (`react-scripts 5.0.1`) — bundler & dev server
- **PostgreSQL 15** — wajib dijalankan sebelum backend

---

## 1.10 Catatan untuk Anggota Tim Baru

1. **Jalankan PostgreSQL dulu** (port 5433), lalu backend, lalu frontend — atau gunakan `docker-compose up`.
2. **Model `best.pt` harus ada** di root project; tanpa itu endpoint `/detect/` akan return 503.
3. **Buat user manual** via `scripts/add_user.py` — contoh kredensial test ada di `scripts/test_login.py` (`supervisor1` / `rahasia123`).
4. **Seed part default** bisa lewat `scripts/add_part.py` (membuat `SPUR-GEAR-001` dengan target 5).
5. Backend saat ini **monolitik** — semua logic ada di `main.py` (~620 baris). Untuk kontribusi, pahami alur: **detect → upload → inspection → dashboard**.
6. Role menentukan menu yang terlihat di `DashboardLayout.js` dan akses API di backend.

---

# 2. Dashboard — Cara Kerja End-to-End

Dashboard yang dimaksud adalah halaman **"Live operations"** di route `/app`, di-render oleh `DashboardPage.js`. Halaman ini menjadi home untuk **operator** dan **supervisor**. **Manager** tidak melihat dashboard ini — mereka langsung diarahkan ke `/app/performance`.

## 2.1 Gambaran Alur Keseluruhan

```
Login → /app → RoleHome → DashboardPage
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    Metric Cards         VisionCamera         Latest Inspection
    (dari polling)       (live + save)        + Detection History
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                    GET /inspections/  +  GET /detections/
                    (polling setiap 5 detik)
```

---

## 2.2 Halaman Utama Dashboard

### Langkah 1 — User masuk ke aplikasi

1. User login di `/login` → `AuthContext` memanggil `POST /auth/login`.
2. Token disimpan di `sessionStorage` (`epson_qc_user`).
3. Operator/supervisor diarahkan ke `/app`.
4. Manager diarahkan ke `/app/performance` (bukan dashboard ini).

### Langkah 2 — Routing ke dashboard

- `ProtectedRoute` memastikan user sudah login.
- `DashboardLayout` menampilkan sidebar + area konten (`<Outlet />`).
- Route index `/app` → `RoleHome` → jika bukan manager, render `DashboardPage`.

### Langkah 3 — DashboardPage tampil

Judul halaman: **"Live operations"** — untuk memantau inspeksi terbaru, deteksi kamera live, dan riwayat snapshot AI.

---

## 2.3 Komponen Utama yang Ditampilkan

Dashboard terdiri dari **5 area utama** (dari atas ke bawah):

| # | Komponen | Fungsi |
|---|----------|--------|
| **A** | **3× MetricCard** | Ringkasan angka: total inspeksi, pass rate, jumlah snapshot tersimpan |
| **B** | **ImagePreviewModal** | Modal preview gambar (hidden sampai diklik) |
| **C** | **VisionCamera** | Kamera live + deteksi YOLO real-time + tombol save |
| **D** | **LiveFeedCard** | Kartu inspeksi terbaru (gambar, status OK/NG/REVIEW, part, delta) |
| **E** | **Tabel Detection History** | Riwayat snapshot yang pernah disimpan ke database |

### Detail VisionCamera

- `<video>` — stream webcam browser
- `<canvas>` overlay — bounding box hasil deteksi AI
- Panel status — count, confidence, label, autosave ON/OFF
- Tombol **Save now** dan **Start/Stop detection** (dikontrol parent)

### Detail LiveFeedCard

Menampilkan **inspeksi paling baru** (`rows[0]`):

- Thumbnail gambar snapshot
- Badge status (OK / NG / REVIEW / SNAPSHOT)
- Part code, detected qty, target qty, AI score, delta (selisih)
- Tombol "Go to review"

---

## 2.4 Dari Mana Data Dashboard Berasal

Dashboard menggabungkan **3 sumber data**:

| Sumber | Asal | Dipakai untuk |
|--------|------|---------------|
| **Inspections** | PostgreSQL via API | Metric cards, LiveFeedCard |
| **Detections** | PostgreSQL via API | Metric "Saved detections", tabel history |
| **Live detection** | Webcam + YOLO via API | VisionCamera (belum tentu tersimpan) |

```
MetricCard (Total inspections, Pass rate)
    └── useInspections → GET /inspections/ → tabel inspections + join parts

MetricCard (Saved detections)
    └── useDetections → GET /detections/ → tabel detection_results

LiveFeedCard
    └── rows[0] dari useInspections (inspeksi terbaru)

Detection History table
    └── seluruh rows dari useDetections

VisionCamera (live)
    └── Webcam (browser) + POST /detect/ (YOLO)
    └── GET /parts/ (mapping label AI → part)
    └── POST /detections/upload + POST /inspections/ (saat save)
```

**Catatan:** Gambar inspeksi bukan dari frontend — URL-nya (`/static/detections/...`) di-serve backend FastAPI dari folder `static/detections/`.

---

## 2.5 API yang Dipanggil Dashboard

### Saat dashboard pertama kali dibuka

| Method | Endpoint | Dipanggil oleh | Auth |
|--------|----------|----------------|------|
| `GET` | `/inspections/` | `useInspections(5000)` | Bearer token |
| `GET` | `/detections/` | `useDetections(5000)` | Bearer token |
| `GET` | `/parts/` | `useParts()` di VisionCamera | Bearer token |

Kedua hook polling **setiap 5 detik** (DashboardPage override default 12 detik).

### Saat deteksi kamera aktif (Start detection)

| Method | Endpoint | Frekuensi | Fungsi |
|--------|----------|-----------|--------|
| `POST` | `/detect/` | Setiap ~1.4 detik | Inferensi YOLO pada frame webcam |
| `POST` | `/detections/upload` | Saat save (manual/autosave) | Simpan snapshot + metadata ke DB & disk |
| `POST` | `/inspections/` | Setelah save berhasil | Buat record inspeksi QC otomatis |

### Saat aksi user di dashboard

| Method | Endpoint | Trigger |
|--------|----------|---------|
| `DELETE` | `/detections/` | Tombol "Clear history" (supervisor/manager) |

### Prasyarat (sebelum dashboard)

| Method | Endpoint | Kapan |
|--------|----------|-------|
| `POST` | `/auth/login` | Saat login — token dipakai semua request di atas |

---

## 2.6 Bagaimana Data Diproses Sebelum Ditampilkan

### A. Data inspeksi → Metric Cards

Fungsi `getDashboardMetrics()` di `DashboardPage.js`:

1. Backend mengembalikan array inspeksi **urut `created_at` DESC**.
2. Frontend hitung: total, jumlah OK, jumlah NG, rata-rata selisih (`discrepancy`), pass rate (%).
3. Jumlah snapshot = panjang array detections.
4. Hasil di-`useMemo` agar tidak dihitung ulang setiap render kecuali data berubah.

### B. Data inspeksi → LiveFeedCard

1. Ambil elemen pertama array (`rows[0]`).
2. `formatConfidence()` — ubah skor 0–1 menjadi persen.
3. `qtyDiscrepancy()` — hitung `target_quantity - detected_quantity`.
4. `buildAbsoluteUrl()` — gabung `REACT_APP_API_URL` + path relatif gambar.
5. Tentukan warna badge berdasarkan status (OK=hijau, NG=merah, REVIEW=kuning).

### C. Data deteksi live → VisionCamera

**Langkah per frame (~1.4 detik):**

1. Capture frame dari `<video>` ke canvas offscreen → blob JPEG.
2. Kirim `FormData` ke `POST /detect/`.
3. Backend jalankan YOLO → return `{ count, detections: [{bbox, confidence, label}] }`.
4. Frontend update state, gambar bounding box di canvas overlay, cek count stabil.

**Langkah saat save:**

1. Capture snapshot JPEG dari webcam.
2. `POST /detections/upload` dengan `file`, `count`, `detections` (JSON string).
3. Backend simpan file ke `static/detections/` + record ke `detection_results`.
4. Cari part yang cocok dari label YOLO (`findPartByLabel()`).
5. `POST /inspections/` dengan operator_id, part_id, detected_quantity, confidence, image_url.
6. Backend hitung status OK/NG/REVIEW vs target_quantity part.
7. Dispatch event `inspections:reload` → dashboard refresh segera.

### D. Data deteksi → Tabel history

Hanya 3 deteksi pertama per baris yang ditampilkan; confidence dibulatkan ke persen.

---

## 2.7 State Management yang Digunakan

Project ini **tidak memakai Redux/Zustand**.

### Global — React Context

| Context | Isi | Persistensi |
|---------|-----|-------------|
| **AuthContext** | `user`, `token`, `login()`, `logout()`, `isAuthenticated` | `sessionStorage` |

### Server state — Custom Hooks (local state + polling)

| Hook | State | Polling |
|------|-------|---------|
| `useInspections(5000)` | `rows`, `error`, `loading`, `reload()` | 5 detik |
| `useDetections(5000)` | `rows`, `error`, `loading`, `reload()` | 5 detik |
| `useParts()` | `parts`, `loading`, `error` | Sekali saat mount |

### Local state — DashboardPage

| State | Fungsi |
|-------|--------|
| `detectionActive` | ON/OFF deteksi kamera (default: **OFF**) |

### Local state — VisionCamera

| State/Ref | Fungsi |
|-----------|--------|
| `count`, `detections` | Hasil deteksi live saat ini |
| `status`, `error`, `streamReady` | Status kamera & deteksi |
| `saving`, `autosaveEnabled` | Proses save & mode autosave |
| `lastCountRef`, `saveTimerRef` | Logika "count stabil 3 detik baru save" |
| `savedHistory` | 4 snapshot terakhir di memori lokal |

### Komunikasi antar komponen — Custom Events

| Event | Pemicu | Penerima |
|-------|--------|----------|
| `inspections:reload` | VisionCamera setelah create inspection | DashboardPage → `reload()` |
| `preview:image` | Klik thumbnail di LiveFeedCard | ImagePreviewModal |
| `auth:unauthorized` | Axios interceptor saat 401 | AuthContext → logout |

---

## 2.8 Alur Data Backend → UI (End-to-End)

### Skenario A — Dashboard dibuka (read-only)

```
Langkah 1: Browser render DashboardPage
     │
Langkah 2: useInspections & useDetections mount
     │
Langkah 3: Axios GET /inspections/ + GET /detections/
           Header: Authorization: Bearer <token>
     │
Langkah 4: Backend validasi token → query PostgreSQL
           inspections JOIN parts → return JSON array
           detection_results ORDER BY created_at DESC → return JSON
     │
Langkah 5: Hooks setState(rows) → React re-render
     │
Langkah 6: getDashboardMetrics() → 3 MetricCard ter-update
           rows[0] → LiveFeedCard tampil inspeksi terbaru
           detections → tabel history terisi
     │
Langkah 7: Setiap 5 detik, langkah 3–6 diulang (polling)
```

### Skenario B — Operator menjalankan deteksi live

```
Langkah 1: Klik "Start detection" → detectionActive = true
     │
Langkah 2: VisionCamera minta akses webcam (getUserMedia)
     │
Langkah 3: Interval 1.4s — capture frame → POST /detect/
     │
Langkah 4: Backend: PIL buka gambar → YOLO inference → JSON
     │
Langkah 5: Frontend update count + gambar bbox di canvas overlay
     │
Langkah 6: (Opsional) Count stabil 3 detik + autosave ON
           → POST /detections/upload (gambar + metadata)
     │
Langkah 7: Backend simpan file + INSERT detection_results
     │
Langkah 8: VisionCamera POST /inspections/
     │
Langkah 9: Backend INSERT inspections, hitung status OK/NG/REVIEW
     │
Langkah 10: dispatchEvent('inspections:reload')
     │
Langkah 11: DashboardPage reload GET /inspections/
            LiveFeedCard & MetricCard ter-update
            (polling detections juga update tabel history ≤5 detik)
```

### Skenario C — Menampilkan gambar inspeksi

```
Backend: image_url = "/static/detections/detection_abc123.jpg"
     │
Frontend: buildAbsoluteUrl()
     → "http://localhost:8000/static/detections/detection_abc123.jpg"
     │
Browser: <img src="..."> fetch langsung dari backend static mount
     │
Klik thumbnail → event preview:image → ImagePreviewModal fullscreen
```

### Ringkasan Dashboard

| Pertanyaan | Jawaban singkat |
|------------|-----------------|
| Dashboard di route mana? | `/app` (via `RoleHome` → `DashboardPage`) |
| Siapa yang melihatnya? | Operator & supervisor (manager di-redirect) |
| Data utama dari mana? | PostgreSQL via REST API, polling 5 detik |
| Bagian "live" dari mana? | Webcam + POST `/detect/` setiap 1.4 detik |
| Kapan data masuk DB? | Saat user save / autosave di VisionCamera |
| State global? | Hanya auth (`AuthContext`); sisanya hooks + local state |
| Refresh setelah save? | Event `inspections:reload` + polling otomatis |

**Default penting:** Deteksi kamera **OFF** saat halaman dibuka — operator harus klik **"Start detection"** dulu. Autosave juga **OFF** secara default di VisionCamera.

---

# 3. Computer Vision, Machine Learning, dan AI

Project ini memakai **YOLO (Ultralytics)** untuk **object detection** — menghitung jumlah part dari gambar webcam. Tidak ada script training di repo; yang ada adalah **inferensi + integrasi ke dashboard QC**.

Model weights (`best.pt`, `comvis_best.pt`) **tidak ada di repository** (kemungkinan disimpan lokal atau dibagikan terpisah).

---

## 3.1 Folder dan File yang Terkait

### Backend — inti ML/CV

| Path | Peran |
|------|-------|
| `main.py` | Load model YOLO, endpoint `/detect/`, simpan hasil deteksi, bridge ke inspeksi |
| `models.py` | Tabel `detection_results`, kolom `ai_confidence_score` di `inspections` |
| `schemas.py` | DTO `DetectionCreate`, `DetectionListItem`, field AI di inspeksi |
| `requirements.txt` | Dependency `ultralytics` (+ Pillow untuk gambar) |
| `static/detections/` | Penyimpanan snapshot gambar hasil deteksi (di-serve via `/static/`) |
| `best.pt` / `comvis_best.pt` / `best.pt.zip` | **Artefak model** (eksternal, tidak ada di repo) |
| `.model_cache/` | Cache ekstraksi model dari zip (dibuat runtime) |

### Frontend — konsumsi hasil AI

| Path | Peran |
|------|-------|
| `frontend/src/components/VisionCamera.js` | Webcam → kirim frame → tampilkan bbox + confidence + save |
| `frontend/src/pages/DashboardPage.js` | Live feed, metric AI, tabel detection history |
| `frontend/src/hooks/useDetections.js` | Polling data deteksi tersimpan |
| `frontend/src/hooks/useParts.js` | Mapping label YOLO → master part |
| `frontend/src/hooks/useInspections.js` | Polling inspeksi (termasuk `ai_confidence_score`) |
| `frontend/src/api/client.js` | HTTP client ke backend |

### Halaman terkait (menampilkan output AI)

| Path | Peran |
|------|-------|
| `frontend/src/pages/InspectionsPage.js` | Riwayat inspeksi + skor AI |
| `frontend/src/pages/PerformancePage.js` | Statistik OK/NG (data hasil pipeline CV) |

### Database & migrasi

| Path | Peran |
|------|-------|
| `alembic/versions/001_add_image_path.py` | Kolom `image_path` di `detection_results` |
| `alembic/versions/003_remove_weights.py` | Hapus kolom berat — pivot ke deteksi count-based |

### Konfigurasi deployment

| Path | Peran |
|------|-------|
| `start-all.ps1` | Set `DETECTION_MODEL_PATH='best.pt'` |
| `docker-compose.yml` | Set `DETECTION_MODEL_PATH: best.pt` untuk container backend |

### Yang tidak ada di repo

- Script training/validasi YOLO
- Notebook atau dataset
- Folder `runs/`, `datasets/`, atau config YOLO (`.yaml`)
- File model `.pt` (tidak ter-commit)

---

## 3.2 Fungsi Masing-Masing File

### `main.py` — pusat inferensi

- **Startup:** load YOLO dari `DETECTION_MODEL_PATH` (fallback: `best.pt` → `comvis_best.pt` → `best.pt.zip`)
- **`POST /detect/`:** terima gambar → YOLO inferensi → JSON bbox + label + confidence
- **`POST /detections/upload`:** simpan gambar + metadata deteksi ke DB & disk
- **`GET /detections/`:** baca riwayat deteksi
- **`POST /inspections/`:** terima `detected_quantity` + `ai_confidence_score` dari frontend
- **`GET /healthz`:** cek `model_loaded: true/false`

Parameter inferensi (hardcoded):

```python
model(image, imgsz=640, conf=0.25, verbose=False)
```

### `models.py` — persistensi hasil AI

- **`DetectionResult`:** `count`, `detections` (JSON bbox/label/confidence), `image_path`
- **`Inspection`:** `detected_quantity`, `ai_confidence_score`, `image_url`, `status`, `discrepancy`

### `schemas.py` — kontrak API deteksi

- `DetectionCreate` / `DetectionListItem`: struktur data deteksi
- `InspectionCreate`: menerima `ai_confidence_score` dari frontend

### `VisionCamera.js` — klien CV di browser

- Akses webcam (`getUserMedia`)
- Capture frame → `POST /detect/` setiap ~1.4 detik
- Gambar bounding box di canvas overlay
- Logika confidence: `< 0.65` → REVIEW, `>= 0.85` → high confidence
- Save: `POST /detections/upload` → lalu `POST /inspections/`
- Mapping label YOLO ke part via `findPartByLabel()`

### `DashboardPage.js` — tampilan hasil AI

- Metric "Saved detections"
- Section `VisionCamera`
- `LiveFeedCard`: inspeksi terbaru + skor AI
- Tabel detection history (label + confidence %)

---

## 3.3 Endpoint API CV/AI

| Method | Endpoint | Fungsi CV/AI | Dipanggil dari |
|--------|----------|--------------|----------------|
| `POST` | **`/detect/`** | **Inferensi YOLO (intinya)** | `VisionCamera.js` |
| `POST` | `/detections/upload` | Simpan snapshot + metadata bbox | `VisionCamera.js` |
| `GET` | `/detections/` | Riwayat deteksi tersimpan | `useDetections.js` |
| `POST` | `/detections/` | Create detection tanpa upload file | Backend (alternatif) |
| `DELETE` | `/detections/` | Hapus riwayat | `DashboardPage.js` |
| `POST` | `/inspections/` | Simpan hasil QC + `ai_confidence_score` | `VisionCamera.js` |
| `GET` | `/inspections/` | Tampilkan inspeksi + skor AI | Dashboard, Inspections |
| `GET` | `/parts/` | Mapping label YOLO → part | `VisionCamera.js` |
| `GET` | **`/healthz`** | Cek model YOLO loaded | Monitoring/dev |
| `GET` | `/static/detections/{file}` | Serve gambar snapshot | Browser `<img>` |

**Endpoint ML murni:** hanya `POST /detect/`. Sisanya pipeline penyimpanan dan QC.

---

## 3.4 Input dan Output Model

### Input ke model (via `POST /detect/`)

| Aspek | Detail |
|-------|--------|
| **Format request** | `multipart/form-data`, field `file` |
| **Sumber** | Frame JPEG dari webcam (640×480) atau upload gambar |
| **Preprocessing backend** | `PIL.Image.open()` → convert ke **RGB** |
| **Parameter YOLO** | `imgsz=640`, `conf=0.25` |
| **Auth** | Bearer token wajib |

### Output model (response `/detect/`)

```json
{
  "count": 5,
  "detections": [
    {
      "bbox": [120.5, 80.3, 200.1, 160.7],
      "confidence": 0.912,
      "label": "SPUR-GEAR-001"
    }
  ],
  "timestamp": "2026-06-06T10:30:00Z"
}
```

| Field | Arti |
|-------|------|
| `count` | Jumlah bounding box terdeteksi (= jumlah part) |
| `detections[].bbox` | `[x1, y1, x2, y2]` pixel, format xyxy |
| `detections[].confidence` | Skor 0–1 dari YOLO |
| `detections[].label` | Class name dari `model.names` (harus selaras dengan `part_code` di DB) |
| `timestamp` | Waktu inferensi (UTC) |

**Catatan:** `count` = `len(boxes)`, bukan output regresi terpisah — setiap objek = 1 deteksi.

### Output tersimpan ke database (setelah save)

**Tabel `detection_results`:**

- `count`, `detections` (JSON), `image_path`, `status`, `created_at`

**Tabel `inspections`:**

- `detected_quantity` (= count), `ai_confidence_score` (= confidence deteksi pertama), `image_url`, `status` (OK/NG/REVIEW), `discrepancy`

---

## 3.5 Bagaimana Hasil Prediksi Dikirim ke Dashboard

### Jalur A — Prediksi live (real-time, belum ke DB)

```
Webcam
  → VisionCamera capture frame (canvas → JPEG blob)
  → POST /detect/
  → Backend YOLO inference
  → JSON { count, detections }
  → VisionCamera:
       setCount(), setDetections()
       drawBoxes() di canvas overlay
       tampil confidence, label, status di panel kanan
```

Data ini **hanya di React state lokal** — belum muncul di metric card atau tabel history.

### Jalur B — Prediksi disimpan → dashboard ter-update

```
VisionCamera: Save now / Autosave (count stabil 3 detik)
  │
  ├─► POST /detections/upload
  │     (file JPEG + count + detections JSON)
  │     Backend: simpan ke static/detections/ + INSERT detection_results
  │
  ├─► POST /inspections/
  │     (part_id, detected_quantity, ai_confidence_score, image_url)
  │     Backend: hitung OK/NG/REVIEW vs target_quantity
  │
  └─► window.dispatchEvent('inspections:reload')
        │
        ├─► useInspections → GET /inspections/
        │     → MetricCard (pass rate, total)
        │     → LiveFeedCard (inspeksi terbaru + gambar + AI score)
        │
        └─► useDetections → GET /detections/ (polling 5 detik)
              → MetricCard "Saved detections"
              → Tabel Detection History
```

### Jalur C — Gambar di UI

```
image_url = "/static/detections/detection_abc123.jpg"
  → buildAbsoluteUrl() + apiBaseUrl
  → http://localhost:8000/static/detections/...
  → <img> di LiveFeedCard / modal preview
```

---

## 3.6 Bagian yang Kemungkinan Perubahan Terbaru dari Tim Computer Vision

| Indikator | File / detail | Mengapa kemungkinan CV team |
|-----------|---------------|----------------------------|
| Nama model `comvis_best.pt` | `main.py` | "comvis" = computer vision |
| Zip model + cache extract | `main.py` | Fleksibilitas deploy model besar |
| Endpoint `/detect/` + thread pool | `main.py` | Core integrasi YOLO |
| `DetectionResult` + upload | `main.py`, `models.py` | Pipeline snapshot AI |
| `ai_confidence_score` | `models.py`, `schemas.py`, `VisionCamera.js` | Metadata AI di QC |
| `findPartByLabel()` | `VisionCamera.js` | Bridge label YOLO ↔ part DB |
| Threshold confidence 0.65 / 0.85 | `VisionCamera.js` | Business rule dari hasil eksperimen CV |
| Autosave OFF by default | `VisionCamera.js` | Iterasi UX setelah testing |
| Hapus kolom weight | `alembic/versions/003_remove_weights.py` | Pivot QC: berat → computer vision count |
| `001_add_image_path` | `alembic/versions/001_add_image_path.py` | Simpan bukti visual deteksi |
| `DETECTION_MODEL_PATH` | `start-all.ps1`, `docker-compose.yml` | Konfigurasi model untuk dev/deploy |

**Yang hampir pasti bukan tim CV:** auth, audit log, parts CRUD, role management, PerformancePage charts.

**Yang tidak ada di repo tapi milik tim CV (kemungkinan):** training script, dataset, file `best.pt` / `comvis_best.pt`, evaluasi mAP/precision.

---

## 3.7 Daftar File yang Perlu Dipelajari Terlebih Dahulu

### Prioritas 1 — Wajib (intake CV)

1. **`main.py`** — load model, `/detect/`, parameter YOLO, upload detections
2. **`requirements.txt`** — dependency `ultralytics`
3. **`frontend/src/components/VisionCamera.js`** — alur webcam → inferensi → save → inspection

### Prioritas 2 — Kontrak data

4. **`models.py`** — `DetectionResult`, `Inspection.ai_confidence_score`
5. **`schemas.py`** — shape JSON deteksi & inspeksi
6. **`frontend/src/hooks/useDetections.js`** — cara dashboard baca data tersimpan

### Prioritas 3 — Tampilan & pipeline lengkap

7. **`frontend/src/pages/DashboardPage.js`** — bagaimana output AI ditampilkan
8. **`frontend/src/hooks/useParts.js`** — mapping label model ke part
9. **`start-all.ps1`** + **`docker-compose.yml`** — cara menjalankan model lokal

### Prioritas 4 — Konteks & evolusi

10. **`alembic/versions/001_add_image_path.py`** — evolusi schema deteksi
11. **`alembic/versions/003_remove_weights.py`** — pergeseran dari weight ke CV count
12. **`frontend/src/pages/InspectionsPage.js`** — bagaimana supervisor review hasil AI

### Artefak eksternal (pelajari di luar repo)

13. **`best.pt`** / **`comvis_best.pt`** — weights YOLO (class names, jumlah class, performa)
14. Dokumentasi tim CV tentang label class dan target quantity per part

---

# 4. Diagram Arsitektur

## 4.1 Diagram Sistem Keseluruhan

```
                    ┌─────────────────────────────────────┐
                    │           PENGGUNA (Browser)         │
                    │  Operator | Supervisor | Manager     │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │         FRONTEND (React 19 SPA)        │
                    │  Port 3000 (dev) / 80 via Nginx (prod) │
                    │                                        │
                    │  LoginPage ──► AuthContext             │
                    │  DashboardPage ──► VisionCamera        │
                    │    │ webcam + canvas overlay           │
                    │  InspectionsPage / PartsPage / Audit   │
                    │  PerformancePage (Recharts)          │
                    │                                        │
                    │  api/client.js (Axios + Bearer token)  │
                    └──────────────────┬──────────────────┘
                                       │ REST JSON / FormData
                    ┌──────────────────▼──────────────────┐
                    │      BACKEND (FastAPI + Uvicorn)       │
                    │              Port 8000                 │
                    │                                        │
                    │  ┌─────────┐  ┌──────────────────┐   │
                    │  │ Auth    │  │ Business Logic   │   │
                    │  │ HMAC    │  │ OK/NG/REVIEW     │   │
                    │  │ token   │  │ RBAC enforcement │   │
                    │  └─────────┘  └──────────────────┘   │
                    │                                        │
                    │  ┌─────────┐  ┌──────────────────┐   │
                    │  │ YOLO    │  │ Static Files     │   │
                    │  │ best.pt │  │ /static/detections│  │
                    │  └─────────┘  └──────────────────┘   │
                    │                                        │
                    │  models.py + schemas.py + database.py  │
                    └──────────┬─────────────┬───────────────┘
                               │             │
              ┌────────────────▼──┐    ┌─────▼──────────────┐
              │   PostgreSQL 15    │    │  Webcam (client)   │
              │   DB: epson_qc     │    │  MediaDevices API  │
              │   Port 5433        │    └────────────────────┘
              │                    │
              │  parts             │
              │  users             │
              │  inspections       │
              │  detection_results │
              │  audit_logs        │
              └────────────────────┘

         ┌─────────────────────────────────────────────┐
         │           Docker Compose Stack               │
         │  postgres ──► backend ──► frontend (nginx)  │
         │     └── pgadmin (opsional, port 5050)       │
         └─────────────────────────────────────────────┘
```

## 4.2 Diagram Pipeline Computer Vision

```
Webcam (640×480)
      │
      ▼
VisionCamera.js — capture frame → JPEG blob
      │
      ▼
POST /detect/  ──►  main.py
      │               │
      │               ├─ PIL: RGB image
      │               ├─ YOLO(imgsz=640, conf=0.25)
      │               └─ Parse boxes → JSON
      │
      ▼
{ count, detections[{bbox, confidence, label}] }
      │
      ├─► Canvas overlay (live UI)
      │
      └─► Save flow:
            POST /detections/upload → static/detections/ + DB
            POST /inspections/ → OK/NG/REVIEW
            GET /inspections/ + GET /detections/ → Dashboard
```

---

*Dokumen ini dibuat berdasarkan analisis codebase project Epson QC System (capstone-a4-kel1).*
