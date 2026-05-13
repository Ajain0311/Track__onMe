# AttendTrack

Full-stack attendance tracking app with face recognition, WiFi validation, and time analytics.

## Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React Native (Expo ~52)             |
| Backend    | Node.js + Express                   |
| Auth + DB  | Supabase (PostgreSQL + Auth)        |
| State      | Zustand + AsyncStorage              |
| HTTP       | Axios                               |

---

## Quick Start

### 1 · Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/migrations/001_create_attendance.sql`.
3. Copy your credentials from **Settings → API**.

### 2 · Backend

```bash
cd backend
copy .env.example .env      # Windows
# cp .env.example .env      # Mac/Linux
```

Edit `backend/.env`:
```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
PORT=5000
```

```bash
npm install
npm run dev        # starts on http://localhost:5000
```

### 3 · Frontend

```bash
cd frontend
copy .env.example .env      # Windows
# cp .env.example .env      # Mac/Linux
```

Edit `frontend/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

```bash
npm install
npx expo start          # Expo Go / web
npx expo start --web    # Web only
```

**Physical Android device**: add to `frontend/.env`:
```
EXPO_PUBLIC_API_URL=http://192.168.x.x:5000
```
(Replace with your LAN IP — `ipconfig` on Windows, `ifconfig` on Mac/Linux.)

---

## API Reference

All endpoints require `Authorization: Bearer <supabase_access_token>`.

| Method | Path                    | Description               |
|--------|-------------------------|---------------------------|
| GET    | `/`                     | Health check              |
| POST   | `/api/checkin`          | Start attendance session  |
| POST   | `/api/checkout`         | End active session        |
| GET    | `/api/status`           | Current check-in state    |
| GET    | `/api/attendance`       | All records (raw)         |
| GET    | `/api/attendance/daily` | Per-day totals + sessions |

---

## Database Schema

```sql
attendance
  id             UUID  PK
  user_id        UUID  FK → auth.users(id)
  check_in_time  TIMESTAMPTZ
  check_out_time TIMESTAMPTZ  (NULL = active)
  total_duration INTEGER      (minutes)
  date           DATE
  created_at     TIMESTAMPTZ
```

---

## Windows PowerShell note

If `npx` / `npm` scripts fail with execution-policy errors:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
