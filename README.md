# AttendTrack

Production-grade attendance tracking app with face recognition, WiFi/GPS validation, RBAC, audit logging, and a notification inbox.

**Live**: [attendeyesonme.netlify.app](https://attendeyesonme.netlify.app) · Backend: [`track-onme.onrender.com`](https://track-onme.onrender.com/health)

## Stack

| Layer       | Technology                                       |
|-------------|--------------------------------------------------|
| Frontend    | React Native (Expo SDK 52) + react-native-web    |
| Backend     | Node.js + Express (clean-architecture refactor)  |
| Auth + DB   | Supabase (PostgreSQL + Auth)                     |
| State       | Zustand + AsyncStorage                           |
| Validation  | In-house schema validator (no external deps)     |
| Maps/Geocode| OSM Nominatim (free) on web, Expo on native      |
| Deploy      | Netlify (frontend) + Render (backend)            |

---

## Architecture

```
Track__onMe/
├── backend/
│   ├── controllers/     # asyncHandler-wrapped request handlers
│   ├── services/        # database + business logic (supabase, audit, activity, notification …)
│   ├── routes/          # Express routers + validation schemas
│   ├── middleware/      # auth, role, validation, rateLimit, errorHandler, securityHeaders, logger
│   ├── utils/           # AppError, asyncHandler, logger
│   ├── migrations/      # SQL migrations (001–003)
│   └── scripts/         # apply-migrations.js, make-admin.js
├── frontend/
│   ├── screens/         # one per top-level route
│   ├── components/      # ToastProvider, EmptyState, LoadingState, ScreenHeader, AdminGuard
│   ├── services/        # api.js + supabaseConfig + locationService + wifiService …
│   ├── store/           # Zustand stores (auth, theme, time, goal)
│   └── utils/           # csvExport, helpers
└── supabase/migrations/  # Project-level SQL migrations
```

---

## Quick Start

### 1 · Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste-and-run the migrations in order:
   - `backend/migrations/001_admin_locations.sql`
   - `backend/migrations/002_location_requests.sql`
   - `backend/migrations/003_clean_architecture.sql`   ← roles, audit, activity, notifications
3. Copy your credentials from **Settings → API**.
4. Optional: run `node backend/scripts/make-admin.js <your-email>` to grant yourself admin.

To apply migrations programmatically (instead of pasting):
```bash
# Get the direct Postgres URI from: Supabase → Project Settings → Database → Connection string
echo "SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" >> backend/.env
cd backend && npm run migrate
```

### 2 · Backend

```bash
cd backend
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev               # http://localhost:5000
```

### 3 · Frontend

```bash
cd frontend
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start            # native + web
```

For a physical Android device, set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:5000` in `frontend/.env`.

---

## Roles & Permissions

Seeded by migration 003:

| Role         | Slug          | Capabilities                                                 |
|--------------|---------------|--------------------------------------------------------------|
| Super Admin  | `super_admin` | Everything, incl. roles/permissions management               |
| Admin        | `admin`       | Users, locations, requests, audit logs                       |
| Manager      | `manager`     | Review requests, read users, manage locations                |
| User         | `user`        | Check-in/out, request locations, own data                    |

Backend enforces RBAC via `requireRole(roles[])` / `requirePermission(slug)`.

---

## API Reference

All endpoints require `Authorization: Bearer <supabase_access_token>`.

### User
| Method | Path                       | Description                  |
|--------|----------------------------|------------------------------|
| GET    | `/health`                  | Health + version (no auth)   |
| GET    | `/api/me`                  | Current user identity + role |
| POST   | `/api/checkin`             | Start session (validated)    |
| POST   | `/api/checkout`            | End session                  |
| GET    | `/api/status`              | Active session?              |
| GET    | `/api/attendance`          | Raw records                  |
| GET    | `/api/attendance/daily`    | Per-day totals               |
| GET    | `/api/locations`           | Active + user-specific       |
| GET    | `/api/location-requests`   | My requests                  |
| POST   | `/api/location-requests`   | Submit a request             |
| DELETE | `/api/location-requests/:id` | Cancel pending             |
| GET    | `/api/notifications`       | Inbox                        |
| PATCH  | `/api/notifications/:id/read`   | Mark read              |
| PATCH  | `/api/notifications/read-all`   | Mark all read          |
| GET    | `/api/activity`            | My activity timeline         |

### Admin (`admin` or `manager` role required)
| Method | Path                                              | Description                |
|--------|---------------------------------------------------|----------------------------|
| GET    | `/api/admin/stats`                                | Dashboard counters         |
| GET    | `/api/admin/users`                                | List users (paginated)     |
| GET    | `/api/admin/users/:id/attendance`                 | Per-user records           |
| PATCH  | `/api/admin/users/:id/role`                       | Promote/demote user        |
| CRUD   | `/api/admin/locations[/:id]`                      | Manage locations           |
| GET    | `/api/admin/location-requests?status=pending`     | Review queue               |
| PATCH  | `/api/admin/location-requests/:id/approve`        | Approve request            |
| PATCH  | `/api/admin/location-requests/:id/reject`         | Reject request             |
| GET    | `/api/admin/audit-logs`                           | Sensitive action trail     |

---

## Deployment

### Frontend → Netlify
- `netlify.toml` is in the repo. Pushing to `main` auto-deploys.
- Env vars needed in Netlify dashboard: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Backend → Render
- Auto-deploy on push to `main` (Render free tier — cold starts ~30s).
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `CORS_ORIGIN`, `LOG_LEVEL`.

---

## Features

- 🟢 Check-in / check-out with WiFi or GPS validation
- 🎭 Face recognition (consecutive-frame match)
- 📍 Location requests workflow (user submits → admin approves)
- ⚡ Admin panel: users, locations, requests, audit logs
- 🔔 Notifications inbox + bell with unread badge
- 📋 Activity timeline (per-user)
- 📜 Audit log (admin actions)
- ⬇ CSV export (own history + any user, admin only)
- 🌗 Dark/light/system theme
- 🔐 RBAC with seeded roles + permissions
- 🛡 Rate limiting, security headers, structured logging
- 📱 Mobile + web from one codebase

---

## Development tips

PowerShell execution-policy fix if `npm`/`npx` fails:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Run only the backend tests / boot smoke check:
```bash
cd backend && node -e "require('./index.js'); setTimeout(() => process.exit(0), 1500)"
```

---

## License

Internal project — see repo owner for licensing.
