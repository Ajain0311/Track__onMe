# AttendTrack

> Attendance tracking with **WiFi/GPS geofencing**, **face verification** (native), **role-based admin panel**, **audit trail**, and **per-user location approval**.

[![Backend Status](https://img.shields.io/website?down_color=red&down_message=down&label=backend&up_color=brightgreen&up_message=up&url=https%3A%2F%2Ftrack-onme.onrender.com%2Fhealth)](https://track-onme.onrender.com/health)
[![Frontend](https://img.shields.io/badge/frontend-live-brightgreen)](https://attendeyesonme.netlify.app)
[![Tests](https://img.shields.io/badge/tests-16%20passing-brightgreen)](.github-workflows-staged/ci.yml.txt)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-blue)](https://github.com/Ajain0311/Track__onMe/actions)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js)](https://nodejs.org)
[![Expo SDK](https://img.shields.io/badge/Expo_SDK-52-000020?logo=expo)](https://expo.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/license-Internal-lightgrey)](#license)

> ⚠️ **Transparency notice** — this README is intentionally honest about what is real, what is partial, and what is a placeholder. Read the [Honest feature matrix](#honest-feature-matrix), [Security risks still present](#security-risks-still-present), and [Mock / dead / placeholder code](#mock--dead--placeholder-code) sections before relying on this in production.

---

## Table of contents

1. [What this project does](#what-this-project-does)
2. [Live deployment](#live-deployment)
3. [Tech stack](#tech-stack)
4. [Architecture overview](#architecture-overview)
5. [Honest feature matrix](#honest-feature-matrix)
6. [Authentication flow](#authentication-flow)
7. [Attendance validation flow](#attendance-validation-flow)
8. [Face verification logic](#face-verification-logic)
9. [Geofencing logic](#geofencing-logic)
10. [API validation details](#api-validation-details)
11. [API endpoints overview](#api-endpoints-overview)
12. [Database structure overview](#database-structure-overview)
13. [Folder structure](#folder-structure)
14. [Environment setup](#environment-setup)
15. [Installation & local development](#installation--local-development)
16. [Deployment](#deployment)
17. [Error handling approach](#error-handling-approach)
18. [Current production status](#current-production-status)
19. [Recently fixed security vulnerabilities](#recently-fixed-security-vulnerabilities)
20. [Security risks still present](#security-risks-still-present)
21. [Mock / dead / placeholder code](#mock--dead--placeholder-code)
22. [Known limitations](#known-limitations)
23. [Pending improvements / roadmap](#pending-improvements--roadmap)
24. [Troubleshooting](#troubleshooting)
25. [Contribution guidelines](#contribution-guidelines)
26. [Version history](#version-history)
27. [License](#license)

---

## What this project does

AttendTrack is an employee attendance system. Users check in / out from approved work locations; admins approve those locations and review attendance.

Core flows the app actually supports today:

- **Sign up / sign in** via Supabase Auth (email + password, password reset email)
- **Check in / out** with location authorization, GPS geofence, and face verification (native) or password (web)
- **Daily / weekly / monthly time tracking** with a local persistent timer (resumes correctly after app restart)
- **Location requests**: users submit a location, admin approves/rejects. Approved locations appear only in that user's picker.
- **Admin panel** (role-gated): stats, users, locations, location requests, live attendance, audit logs
- **Audit log + activity timeline + notification inbox** (per migration 003)
- **CSV export** of attendance (own + admin per-user)
- **WiFi-aware auto-checkout** (native): if the user checked in on the office WiFi and leaves it for 3 polls (24 s) after a 2-min grace period, they're auto-checked-out

---

## Live deployment

| | URL |
|---|---|
| Frontend (Netlify, React Native Web) | <https://attendeyesonme.netlify.app> |
| Backend (Render, Node + Express) | <https://track-onme.onrender.com/health> |
| GitHub repo | <https://github.com/Ajain0311/Track__onMe> |
| CI runs | <https://github.com/Ajain0311/Track__onMe/actions> |

Render runs on a free tier — **expect ~30–50 s cold start** on the first request after idle. The frontend's role fetch retries up to ~50 s to cover this.

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React Native (Expo SDK 52) + `react-native-web` | One codebase for iOS / Android / Web |
| Navigation | `@react-navigation/native` + `native-stack` + `bottom-tabs` | Stack inside bottom tabs |
| State | Zustand + AsyncStorage | `authStore`, `themeStore`, `timeStore`, `goalStore` |
| HTTP | Axios (with token interceptor) | Single `services/api.js` |
| Backend | Node ≥ 20, Express 4 | Clean architecture (controllers → services → DB) |
| Auth + DB | Supabase (Postgres 17 + Auth) | Service-role key on backend; anon key on frontend |
| Validation | In-house schema validator | Zero external deps (`middleware/validate.js`) |
| Logging | In-house leveled logger | Zero deps (`utils/logger.js`) |
| Rate limit | In-house sliding window | Zero deps (`middleware/rateLimit.js`) |
| Maps (web) | Leaflet + OpenStreetMap | Free; loaded dynamically by `MapPreview` |
| Geocode | Expo Location (native) / OSM Nominatim (web) | Free, rate-limited |
| Tests | `node --test` (built-in) | 16 cases, no Jest |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| Deploy | Netlify (frontend) + Render (backend) | Auto-deploy on push to `main` |

---

## Architecture overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            React Native / Expo Web                          │
│   LoginScreen → MainTabs (Dashboard / Analytics / History / Settings /     │
│                            Admin*)                                          │
│   ↓                                                                         │
│   Modal stacks: LocationPicker → FaceVerification → check-in API call      │
│   ↓                                                                         │
│   services/api.js  (Axios + Supabase JWT in Authorization header)          │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │  HTTPS / Bearer <supabase_jwt>
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      Express on Render (Node ≥ 20)                          │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │  middleware chain                                                 │     │
│   │   securityHeaders → cors → json(1MB) → requestLogger →           │     │
│   │   rateLimit(200/min/IP) → route                                  │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│   ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────┐    │
│   │  controllers │→ │     services     │→ │ Supabase JS (service key)│    │
│   │ (asyncHandler)│  │  (DB + business) │  │                          │    │
│   └──────────────┘  └──────────────────┘  └──────────────────────────┘    │
│                                                                             │
│   Auth: verifyToken → supabase.auth.getUser(jwt)                           │
│   RBAC: requireRole(['admin','manager']) → user_roles + role_permissions   │
│   Error: AppError → errorHandler (5xx with stack, 4xx as warn)             │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │  PostgREST + Realtime (service key bypasses RLS)
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       Supabase (Postgres 17 + Auth)                         │
│  auth.users (managed)                                                       │
│  user_roles → roles → role_permissions → permissions                       │
│  locations  ←  user_locations  /  user_location_access                     │
│  location_requests                                                          │
│  attendance                                                                 │
│  audit_logs / activity_logs / notifications                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Honest feature matrix

### ✅ Fully working (verified in production)

| Feature | Where | Notes |
|---|---|---|
| Email/password sign in + sign up | `LoginScreen.js`, Supabase Auth | Includes "Forgot password" via `supabase.auth.resetPasswordForEmail` |
| Persistent attendance timer | `timeStore.js` + `DashboardScreen.js` | Resumes elapsed time from server `session.checkInTime` after app restart |
| Check in / out (authorized) | `attendanceController.js` + `LocationPicker` + `FaceVerification` | See [Attendance validation flow](#attendance-validation-flow) |
| Location authorization (server-side) | `attendanceController.authorizeLocation` | Verifies location exists + active + user has access + within 1.5× radius |
| Native face verification (registration + match) | `FaceRegistrationScreen.js` + `FaceVerificationScreen.js` + `faceRecognitionService.js` | Multi-sample registration (5 frames averaged); match requires 3 consecutive frames ≥ 0.82 similarity |
| Web check-in second factor | `FaceVerificationScreen.js` (web branch) | Password re-entry via `supabase.auth.signInWithPassword` before `/api/checkin` is called |
| Location request workflow | `locationRequestController.js`, `LocationRequestScreen.js`, `MyLocationRequestsScreen.js`, `AdminLocationRequestsScreen.js` | Submit → admin approves → location created with `is_global=false` + linked via `user_locations` |
| Admin user management | `adminController.js`, `AdminUsersScreen.js`, `AdminUserDetailScreen.js` | Role cycle: `user` → `manager` → `admin` (super_admin protected) |
| Admin location CRUD | `locationController.js`, `AdminLocationsScreen.js`, `AdminLocationFormScreen.js` | Map preview + GPS capture |
| Live attendance (admin) | `AdminLiveAttendanceScreen.js`, `GET /api/admin/active-sessions` | Polls every 15 s |
| Audit log (server-recorded sensitive admin actions) | `auditService.js`, `AdminAuditLogsScreen.js` | Records location/role/request mutations with actor + IP + UA |
| Activity timeline (per user) | `activityService.js`, `ActivityScreen.js` | Records check_in, check_out, location_request, login |
| Notification inbox (in-app) | `notificationService.js`, `NotificationsScreen.js`, bell on Dashboard | Polls unread count every 60 s while Dashboard focused |
| CSV export | `utils/csvExport.js` | Web: Blob download; Native: Share API. Used by History + Admin User Detail |
| Map preview | `MapPreview.js` | Web: Leaflet + OSM tiles loaded dynamically. Native: coordinate fallback |
| Reverse geocoding | `locationService.reverseGeocode` | Native: Expo Location. Web: OSM Nominatim |
| WiFi-aware auto-checkout | `wifiMonitor.js` | **Native only.** 2-min grace, then 3 consecutive off-WiFi polls (24 s) |
| Password change | `ChangePasswordScreen.js`, Supabase Auth | Client-side validation (≥8 chars, letter + number, match confirm) |
| Backend security headers | `middleware/securityHeaders.js` | HSTS, X-Frame-Options:DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Backend rate limiting | `middleware/rateLimit.js` | 200/min/IP global + 20/min/user on check-in/out |
| Input validation | `middleware/validate.js` | All admin routes + check-in + location requests |
| RBAC (4 roles, 19 permissions) | `migrations/003_clean_architecture.sql`, `middleware/requireRole.js` | super_admin / admin / manager / user |
| Centralized error handling | `middleware/errorHandler.js`, `utils/AppError.js` | Typed errors → predictable JSON response |
| Unit tests (16, zero deps) | `backend/__tests__/` | `node --test` covers validate, AppError, rateLimit, csvExport |
| CI on every push | `.github/workflows/ci.yml` | Backend tests + frontend smoke build |
| Forgot-password email | Supabase Auth | Redirect URL = current origin |
| Pull-to-refresh + focus refetch | Multiple screens | Dashboard `useFocusEffect` silently re-syncs status |

### 🟡 Partial / experimental

| Feature | What works | What doesn't / caveat |
|---|---|---|
| **Web check-in / out** | Password re-auth via Supabase blocks anonymous abuse | **No face verification on web.** Anyone who knows the user's password can check in/out from any browser. |
| **Reverse geocoding (web)** | OSM Nominatim returns full address for given coords | Free tier rate-limited (1 req/sec). No usage policy enforcement; treat as best-effort. |
| **Admin route protection** | All `/api/admin/*` endpoints are server-side gated by `requireRole(['admin','manager'])` | Most admin **screens** only check `useAuthStore(s => s.isAdmin)`. They don't all wrap in `AdminGuard`. Backend remains the source of truth — frontend bypass = wasted UI time, not a security hole. |
| **Notification realtime** | Polling every 60 s while Dashboard is focused | No Supabase realtime subscription yet. New notifications surface within 60 s, not instantly. |
| **Live attendance** | Polls `/api/admin/active-sessions` every 15 s | Same — polling, not push. |
| **Camera permission UX** | `canAskAgain` detection + "Open Settings" deep-link on denial | iOS sometimes silently refuses the deep-link — user has to find Settings manually. |
| **Reverse-geocode accuracy** | Works for most populated areas | Sparse coverage in rural areas; can return empty. |

### 🟠 Mock / dead / placeholder code

| Path | Status | Action recommended |
|---|---|---|
| `frontend/services/firebaseConfig.js` | **DEAD CODE** — imported by nothing, references a separate Firebase project | Delete — Supabase replaced this fully |
| `firebase.json` (root) | **DEAD CODE** — Firebase Hosting config from old version | Delete |
| `firestore.indexes.json` (root) | **DEAD CODE** — Firestore config from old version | Delete |
| `frontend/theme/glossy.js` | **UNUSED** — no imports anywhere | Delete |
| `services/biometricAuth.js` | **PARTIAL** — imported by Dashboard but only for label text. Never gates check-in/out. | Either wire it into the flow or remove |
| `.github-workflows-staged/` | **WORKAROUND** — held the CI workflow before the PAT got `workflow` scope. CI is now in `.github/workflows/ci.yml`. | Can be deleted now |
| The "version: '1.0.0'" field in `SettingsScreen.js`'s About row | **HARDCODED** | Wire to backend `/health` if you want it dynamic |
| Reset email redirect target | Returns to `window.location.origin` on web; no reset-flow screen | Works because Supabase signs in via magic link, then user clicks "Change Password" — but a dedicated `/reset` route would be cleaner |

### 🔵 Planned future features

| Feature | Why deferred |
|---|---|
| Server-side face verification | Today face features are stored client-side only (AsyncStorage). Backend doesn't validate them. |
| Supabase Realtime channels for notifications | Polling works; switching to channels needs auth + subscription lifecycle handling |
| Skeleton loaders everywhere | Several screens still use plain spinners |
| Push notifications | Needs Expo Push token registration + a sender service |
| Admin permission-management UI | Role-permission edits today are only via SQL |
| 2FA via TOTP | Supabase supports it but not wired |
| Service worker / offline mode | Significant rework for the React Native Web layer |
| Multi-tenant org separation | Single-tenant today |

---

## Authentication flow

```
┌──────────┐  email+pwd     ┌──────────────┐  jwt              ┌──────────┐
│ Login UI │ ─────────────▶ │ Supabase Auth│ ─────────────────▶│ App store│
└──────────┘                 └──────────────┘                   └──────────┘
                                                                     │ user.id
                                                                     ▼
                                                              ┌────────────┐
                                                              │ GET /api/me│
                                                              └─────┬──────┘
                                                                    │ {role}
                                                                    ▼
                                                            setIsAdmin(role==='admin')
```

1. `LoginScreen` calls `supabase.auth.signInWithPassword({ email, password })`.
2. `supabase.auth.onAuthStateChange` fires → `authStore.setUser(session.user)`.
3. `App.js` `useEffect([user.id])` runs `getMe()` with **retry backoff** (delays `0, 5s, 10s, 15s, 20s`) — total ~50 s window to survive Render cold start.
4. `/api/me`'s response includes `role`; if `admin`, the Admin tab is rendered.
5. `trackLogin(Platform.OS)` is called once per browser session (web) or app launch (native) to record an `activity_logs` row.
6. The Axios instance reads the token via `getIdToken()` (calls `supabase.auth.getSession()`) for every request.

**Forgot password**: `LoginScreen` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`. Supabase emails a magic link; clicking it signs the user in. They then go to **Settings → Change Password**.

---

## Attendance validation flow

This is the most security-critical path. **The backend validates everything** — frontend filtering is purely UX.

```
┌──────────┐    ┌──────────────────────────┐    ┌──────────────────────┐
│Dashboard │───▶│ LocationPickerScreen     │───▶│ FaceVerificationScreen│
│ Check In │    │  • getActiveLocations()   │    │  ┌─────────────────┐ │
└──────────┘    │  • current GPS           │    │  │ NATIVE:          │ │
                │  • current WiFi SSID     │    │  │  detect face     │ │
                │  • compute haversine     │    │  │  extract features│ │
                │  • only show locs where  │    │  │  3 consec ≥ 0.82 │ │
                │    canCheckIn = gps OR   │    │  └─────────────────┘ │
                │    wifi match            │    │  ┌─────────────────┐ │
                │  • user picks one        │    │  │ WEB:             │ │
                └──────────────────────────┘    │  │  re-enter pwd    │ │
                                                │  │  supabase auth   │ │
                                                │  └─────────────────┘ │
                                                └──────────┬────────────┘
                                                           │ checkIn({lat,lng,locationId})
                                                           ▼
                                          ┌────────────────────────────────┐
                                          │ POST /api/checkin              │
                                          │ ▼                              │
                                          │ verifyToken (Supabase JWT)     │
                                          │ rateLimit 20/min/user          │
                                          │ validate { latitude, longitude,│
                                          │   accuracy, locationId(UUID),  │
                                          │   locationName }               │
                                          │ ▼                              │
                                          │ getActiveSession → fail if any │
                                          │ authorizeLocation:             │
                                          │   • locationId REQUIRED        │
                                          │   • location exists & is_active│
                                          │   • is_global=true OR          │
                                          │     row in user_locations OR   │
                                          │     row in user_location_access│
                                          │   • if GPS provided:           │
                                          │       distance ≤ 1.5× radius   │
                                          │ ▼                              │
                                          │ createCheckIn → attendance row │
                                          │ activity.record('check_in')    │
                                          │ 201 { record }                 │
                                          └────────────────────────────────┘
```

The frontend cannot bypass server-side checks by hand-crafting a request — every check-in must pass `authorizeLocation`.

---

## Face verification logic

### Native (iOS / Android via Expo Camera)

- **Registration** (`FaceRegistrationScreen.js`):
  1. Camera detects face with `expo-camera` + landmarks
  2. `validateFacePosition` enforces yaw/roll/pitch limits and minimum face area
  3. Five valid frames collected over ~3 s
  4. `averageFeatures` produces a stable reference template
  5. Saved to **AsyncStorage** at key `@face_data_v2_<userId>`
- **Verification** (`FaceVerificationScreen.js`):
  - Live frames → `extractFaceFeatures` → `calculateSimilarity(stored, current)`
  - Similarity uses **Gaussian decay** on **normalized geometric ratios** (all distances divided by inter-ocular distance, making them scale-invariant)
  - `SIGMA = 0.07`. Threshold = **0.82**.
  - Requires **3 consecutive frames** above threshold to enable the verify button (`CONSECUTIVE_MATCHES = 3`)

### Web (browser)

- **No face detection in browser.** `expo-camera` on web shows the preview but doesn't run face detection.
- Therefore web requires a **second factor**: re-entering the account password (`supabase.auth.signInWithPassword`).
- The verify button stays disabled until ≥ 6 characters are typed.

### What the backend does about face

**Nothing.** The backend trusts the frontend's identity check. Face features live only in AsyncStorage. This is the biggest remaining attack surface — see [Security risks still present](#security-risks-still-present).

---

## Geofencing logic

**Defined in:** `attendanceController.authorizeLocation` (server) + `LocationPickerScreen` (client UX).

- Locations have `latitude`, `longitude`, `radius_meters` (default 200 m), and optional `wifi_ssids[]`.
- Distance is computed with **Haversine formula**.
- Client-side: a location is `canCheckIn` if `gpsValid (distance ≤ radius) OR wifiMatch (current SSID ∈ wifi_ssids)`.
- Server-side: if GPS is provided in the request, distance must be **≤ 1.5 × radius_meters** of the chosen location. The 1.5× tolerance allows for client-side GPS accuracy jitter; tighten it to `1.0×` if you want strict mode.
- WiFi-only check-ins (no `latitude/longitude`) skip the distance check — the location's WiFi SSID is the proof. (You can still add server-side WiFi BSSID verification later; SSID alone is spoofable.)

---

## API validation details

Every input that enters a request body, route param, or query string is validated by `middleware/validate.js`. There are no external schema deps.

**Example schema for `POST /api/admin/locations`:**

```js
const locationBodySchema = {
  name:         { type: 'string', required: true, min: 1, max: 200 },
  address:      { type: 'string', max: 500 },
  latitude:     { type: 'number', required: true, min: -90,  max: 90  },
  longitude:    { type: 'number', required: true, min: -180, max: 180 },
  radiusMeters: { type: 'number', min: 10, max: 5000 },
  wifiSsids:    { type: 'array' },
  isActive:     { type: 'boolean' },
};
```

**Example flow on a bad request:**

```bash
curl -X POST .../api/admin/locations -H 'Authorization: Bearer <jwt>' \
  -d '{ "latitude": 200 }'

→ 422
{
  "error": "Validation failed",
  "code": "validation",
  "details": [
    "name is required",
    "latitude must be <= 90",
    "longitude is required"
  ]
}
```

Supported types: `string` | `number` | `boolean` | `array` | `object` | `uuid` | `email`. Per-field options: `required`, `min`, `max`, `regex`, `enum`, `custom(fn)`.

---

## API endpoints overview

All endpoints (except `/health`) require `Authorization: Bearer <supabase_access_token>`.

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/` | Root JSON ping |
| GET | `/health` | `{ status, uptime, version }` |

### User

| Method | Path | Description |
|---|---|---|
| GET | `/api/me` | User identity + role |
| POST | `/api/me/track-login` | Record an activity_log "login" row |
| POST | `/api/checkin` | Start a session (validated + authorized + geofenced) |
| POST | `/api/checkout` | End the active session |
| GET | `/api/status` | Active session info |
| GET | `/api/attendance` | Raw records |
| GET | `/api/attendance/daily` | Per-day totals |
| GET | `/api/locations` | Active locations the user has access to |
| GET | `/api/location-requests` | My location requests (any status) |
| POST | `/api/location-requests` | Submit a new request |
| DELETE | `/api/location-requests/:id` | Cancel a pending request |
| GET | `/api/notifications` | My notifications (`?unread=1` filter) |
| PATCH | `/api/notifications/:id/read` | Mark one read |
| PATCH | `/api/notifications/read-all` | Mark all read |
| GET | `/api/activity` | My activity timeline |

### Admin (`admin` or `manager` role required)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard counters |
| GET | `/api/admin/active-sessions` | Currently-checked-in users + elapsed |
| GET | `/api/admin/users` | Paginated user list |
| GET | `/api/admin/users/:id/attendance` | Per-user records |
| PATCH | `/api/admin/users/:id/role` | Change a user's role |
| GET | `/api/admin/locations` | All locations |
| GET | `/api/admin/locations/:id` | One location |
| POST | `/api/admin/locations` | Create |
| PUT | `/api/admin/locations/:id` | Update |
| PATCH | `/api/admin/locations/:id/toggle` | Toggle active |
| DELETE | `/api/admin/locations/:id` | Delete |
| GET | `/api/admin/location-requests` | List requests (`?status=pending|approved|rejected`) |
| PATCH | `/api/admin/location-requests/:id/approve` | Approve + create location |
| PATCH | `/api/admin/location-requests/:id/reject` | Reject with optional note |
| GET | `/api/admin/audit-logs` | Paginated audit log |

### Example: full check-in flow with curl

```bash
# 1. Sign in (Supabase Auth — public anon key, NOT the service role key)
TOKEN=$(curl -s -X POST \
  "https://<project>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"u@example.com","password":"…"}' \
  | jq -r .access_token)

# 2. Discover what locations you can check in to
curl -s "$BACKEND/api/locations" -H "Authorization: Bearer $TOKEN"

# 3. Pick one and submit
curl -s -X POST "$BACKEND/api/checkin" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "locationId":"<uuid>", "latitude":28.6, "longitude":77.2, "accuracy":15 }'

# 4. Check out later
curl -s -X POST "$BACKEND/api/checkout" -H "Authorization: Bearer $TOKEN"
```

---

## Database structure overview

Three migrations, applied in order, ship the schema.

```
                        ┌────────────────────┐
                        │   auth.users       │  (Supabase-managed)
                        └─────────┬──────────┘
                                  │
        ┌─────────────────────────┴────────────────────────────────────┐
        ▼                                                                ▼
┌────────────────┐                                              ┌────────────────┐
│ user_roles     │                                              │  attendance    │
│  user_id PK    │                                              │  id PK         │
│  role (text)   │  ←── legacy text role kept                   │  user_id FK    │
│  role_id FK───▶│      for backward compat                     │  check_in_time │
└────────┬───────┘                                              │  check_out_time│
         │                                                      │  total_duration│
         ▼                                                      │  date          │
┌────────────────┐    ┌──────────────────┐    ┌─────────────┐  │  latitude      │
│ roles          │◀──▶│ role_permissions │◀──▶│ permissions │  │  longitude     │
│ slug UNIQUE    │    │ role_id, perm_id │    │ slug UNIQUE │  │  location_id FK│
│ name, descr.   │    └──────────────────┘    │ resource,   │  └────────────────┘
│ is_system      │                            │ action      │
└────────────────┘                            └─────────────┘
                                              
┌──────────────────┐    ┌─────────────────────┐   ┌───────────────────┐
│   locations      │◀──▶│  user_locations     │   │ user_location_    │
│  id PK           │    │  user_id, loc_id    │   │ access (newer)    │
│  name, address   │    │  (legacy junction)  │   │  granted_by       │
│  lat / lng       │    └─────────────────────┘   │  revoked_at       │
│  radius_meters   │                              └───────────────────┘
│  wifi_ssids[]    │
│  is_active       │
│  is_global       │  ← when true, anyone with auth can use it
└─────────┬────────┘
          │
          ▼
┌────────────────────┐
│ location_requests  │
│  user_id, name,    │
│  lat/lng/radius    │
│  wifi_ssids[]      │
│  accuracy          │
│  captured_at       │
│  status (pending/  │
│   approved/rejected│
│  admin_note        │
└────────────────────┘

┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
│  audit_logs    │  │  activity_logs │  │  notifications   │
│  actor_id      │  │  user_id       │  │  user_id         │
│  action        │  │  type          │  │  type, title     │
│  resource(_id) │  │  title         │  │  body, link      │
│  metadata jsonb│  │  description   │  │  is_read, read_at│
│  ip, user_agent│  │  metadata      │  │  metadata        │
└────────────────┘  └────────────────┘  └──────────────────┘
```

**Roles seeded by migration 003**: `super_admin`, `admin`, `manager`, `user`.
**Permissions seeded**: 19 (e.g. `locations.create`, `users.update_role`, `location_requests.approve`, `audit_logs.view`).

---

## Folder structure

```
Track__onMe/
├── backend/
│   ├── controllers/         # asyncHandler-wrapped route handlers
│   │   ├── activityController.js
│   │   ├── adminController.js
│   │   ├── attendanceController.js     ← authorizeLocation lives here
│   │   ├── locationController.js
│   │   ├── locationRequestController.js
│   │   └── notificationController.js
│   ├── services/            # DB queries + business logic
│   │   ├── activityService.js
│   │   ├── adminService.js
│   │   ├── attendanceService.js
│   │   ├── auditService.js
│   │   ├── locationRequestService.js
│   │   ├── locationService.js
│   │   ├── notificationService.js
│   │   └── supabase.js
│   ├── middleware/
│   │   ├── auth.js               # JWT verify
│   │   ├── requireRole.js        # RBAC
│   │   ├── requireAdmin.js       # back-compat shim
│   │   ├── validate.js           # schema validator (no deps)
│   │   ├── rateLimit.js
│   │   ├── requestLogger.js
│   │   ├── securityHeaders.js
│   │   └── errorHandler.js       # always last
│   ├── utils/
│   │   ├── AppError.js
│   │   ├── asyncHandler.js
│   │   └── logger.js
│   ├── routes/
│   │   ├── activity.js
│   │   ├── admin.js
│   │   ├── attendance.js
│   │   ├── locations.js
│   │   ├── locationRequests.js
│   │   └── notifications.js
│   ├── migrations/
│   │   ├── 001_admin_locations.sql
│   │   ├── 002_location_requests.sql
│   │   └── 003_clean_architecture.sql
│   ├── scripts/
│   │   ├── apply-migrations.js      # via pg (needs DB password)
│   │   ├── apply-migrations-mgmt.js # via Supabase Management API
│   │   └── make-admin.js
│   ├── __tests__/                   # node --test (16 cases)
│   │   ├── AppError.test.js
│   │   ├── csvExport.test.js
│   │   ├── rateLimit.test.js
│   │   └── validate.test.js
│   └── index.js                     # entry point
│
├── frontend/
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── AnalyticsScreen.js
│   │   ├── HistoryScreen.js
│   │   ├── SettingsScreen.js
│   │   ├── ChangePasswordScreen.js
│   │   ├── NotificationsScreen.js
│   │   ├── ActivityScreen.js
│   │   ├── LocationPickerScreen.js
│   │   ├── FaceRegistrationScreen.js
│   │   ├── FaceVerificationScreen.js   ← web second-factor lives here
│   │   ├── LocationRequestScreen.js
│   │   ├── MyLocationRequestsScreen.js
│   │   └── admin/
│   │       ├── AdminDashboardScreen.js
│   │       ├── AdminUsersScreen.js
│   │       ├── AdminUserDetailScreen.js
│   │       ├── AdminLocationsScreen.js
│   │       ├── AdminLocationFormScreen.js
│   │       ├── AdminLocationRequestsScreen.js
│   │       ├── AdminLiveAttendanceScreen.js
│   │       └── AdminAuditLogsScreen.js
│   ├── components/
│   │   ├── Toast.js                    # per-screen (legacy)
│   │   ├── ToastProvider.js            # global (preferred)
│   │   ├── EmptyState.js
│   │   ├── LoadingState.js
│   │   ├── ScreenHeader.js
│   │   ├── AdminGuard.js
│   │   ├── ErrorBoundary.js
│   │   ├── MapPreview.js               # web Leaflet / native fallback
│   │   ├── PressableCard.js            # hover / focus on web
│   │   ├── ResponsiveContainer.js
│   │   ├── DailySummaryCard.js
│   │   └── AttendanceCard.js
│   ├── services/
│   │   ├── api.js                      # Axios + endpoint exports
│   │   ├── authService.js              # supabase.auth wrappers
│   │   ├── supabaseConfig.js
│   │   ├── locationService.js          # GPS + reverse geocode
│   │   ├── wifiService.js
│   │   ├── wifiMonitor.js              # auto-checkout (native)
│   │   ├── faceRecognitionService.js   # client-side face match
│   │   ├── biometricAuth.js            # (partial — see honest matrix)
│   │   └── firebaseConfig.js           # DEAD CODE
│   ├── store/                          # Zustand stores
│   ├── utils/csvExport.js
│   ├── App.js                          # navigation + injectWebStyles
│   ├── netlify.toml                    # frontend deploy config
│   └── package.json
│
├── .github/workflows/ci.yml
├── netlify.toml                        # repo-root deploy config (active)
├── README.md
├── CHANGELOG.md
└── package.json                        # supabase CLI devDep
```

---

## Environment setup

### `backend/.env`

```env
PORT=5000
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>     # SECRET — backend only

# Optional
CORS_ORIGIN=https://attendeyesonme.netlify.app   # CSV; defaults to *
LOG_LEVEL=info                                   # error|warn|info|debug
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres   # only for `npm run migrate`
SUPABASE_ACCESS_TOKEN=sbp_...                    # only for `apply-migrations-mgmt.js`
SUPABASE_PROJECT_REF=<project>
```

### `frontend/.env`

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>          # PUBLIC; safe to bundle
EXPO_PUBLIC_API_URL=http://192.168.x.x:5000      # ONLY for physical-device dev
```

In production the frontend hard-codes `https://track-onme.onrender.com/api` for `!__DEV__` builds — `EXPO_PUBLIC_API_URL` is not needed on Netlify.

### `.env` (repo root)

Optional convenience file for scripts; never committed.

---

## Installation & local development

### Prerequisites

- Node.js ≥ 20
- A Supabase project
- (Optional) Expo Go on your phone for native testing

### One-time setup

```bash
git clone https://github.com/Ajain0311/Track__onMe.git
cd Track__onMe

# Backend
cd backend
cp .env.example .env
# … fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY …
npm install
npm test                      # 16 unit tests, all should pass

# Frontend
cd ../frontend
cp .env.example .env
# … fill in EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY …
npm install
```

### Apply database migrations

You need **one of these** to apply DDL:

```bash
# Option A — direct Postgres connection (needs SUPABASE_DB_URL in backend/.env)
cd backend
npm run migrate

# Option B — Supabase Management API (needs SUPABASE_ACCESS_TOKEN + PROJECT_REF)
node scripts/apply-migrations-mgmt.js

# Option C — paste-and-run in Supabase SQL Editor
#   backend/migrations/001_admin_locations.sql
#   backend/migrations/002_location_requests.sql
#   backend/migrations/003_clean_architecture.sql
```

### Make yourself admin

```bash
cd backend
node scripts/make-admin.js you@example.com
# Restart the app and sign in — the ⚡ Admin tab will appear
```

### Run the dev servers

```bash
# Terminal 1 — backend (auto-reloads on save)
cd backend && npm run dev               # http://localhost:5000

# Terminal 2 — frontend
cd frontend && npx expo start           # then press 'w' for web, 'a' for Android, 'i' for iOS
```

For a physical Android device on the same Wi-Fi, set `EXPO_PUBLIC_API_URL` in `frontend/.env` to your laptop's LAN IP.

---

## Deployment

### Frontend → Netlify

- Already configured by `netlify.toml` at the repo root:
  - `base = "frontend"`
  - `command = "npx expo export --platform web"`
  - `publish = "dist"`
  - SPA catch-all redirect `/* → /index.html` (status 200)
- Pushing to `main` triggers an auto-deploy.
- **Required env vars in Netlify dashboard**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Backend → Render

- Single web service running `npm start` (`node index.js`).
- Auto-deploys from `main`. Free tier cold-starts ~30–50 s — the frontend's role-fetch retry tolerates this.
- **Required env vars in Render dashboard**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `CORS_ORIGIN`, `LOG_LEVEL`, `PORT` (defaults to Render's `PORT`).

### CI

- `.github/workflows/ci.yml` runs on every push to `main` + PRs targeting `main`:
  - `backend-tests` — `npm ci && npm test` (16 cases)
  - `frontend-build` — `npm ci && npx expo export --platform web`

---

## Error handling approach

The backend never returns a raw stack trace. Every error becomes one of:

- **Typed `AppError`** (intentional): `400 bad_request`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 conflict`, `422 validation`, `429 rate_limited`
- **Unhandled** (bug): `500 internal` — full stack logged on the server, generic message returned to the client

```ts
// Wire pattern
const handler = asyncHandler(async (req, res) => {
  if (!req.body.foo) throw AppError.badRequest('foo is required');
  // ...
});

// errorHandler.js (last middleware)
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  logger.error(`${req.method} ${req.url} → ${status}`, { stack: err.stack });
  res.status(status).json({ error: err.message, code: err.code, details: err.details });
});
```

The frontend's `getApiErrorMessage(error)` translates HTTP errors into user-readable strings (`401 → "Session expired"`, `ECONNABORTED → "Server may be waking up"`, etc.).

---

## Current production status

| Component | Status | Last verified |
|---|---|---|
| Frontend on Netlify | ✅ Up (HTTP 200) | This README's commit |
| Backend on Render | ✅ Up (`v2.0.0` returned from `/health`) | Same |
| Supabase DB | ✅ All 3 migrations applied | After `apply-migrations-mgmt.js` ran |
| RBAC | ✅ 4 roles + 19 perms + 55 grants seeded | Same |
| CI | ✅ Last run green on `main` | Last push |

You can sanity-check yourself any time:

```bash
curl https://track-onme.onrender.com/health
# → {"status":"ok","uptime":…,"version":"2.0.0"}
```

---

## Recently fixed security vulnerabilities

These were real holes that have been **patched and verified** on the live system.

### 1. Unauthenticated check-in to any location
**Was**: `POST /api/checkin` accepted `{}` and silently created an attendance row. A user could check in from anywhere without picking a location. Or worse — pick a global location they aren't supposed to use.
**Now**: `authorizeLocation` runs server-side and rejects with 400/403 unless:
- `locationId` is supplied,
- the location exists and is active,
- the user has access (`is_global=true` OR `user_locations` row OR `user_location_access` row), and
- if GPS is provided, distance ≤ 1.5× the location's `radius_meters`.

### 2. Web face verification was completely skipped
**Was**: `if (isWeb) await performCheckIn(); return;` — anyone with a logged-in browser session could check in/out as the account holder.
**Now**: Web users must re-enter their account password. The submit button is disabled until ≥ 6 chars typed; submission re-authenticates via `supabase.auth.signInWithPassword` before calling `/api/checkin`.

### 3. Timer reset to `00:00:00` on every app restart
**Was**: When the app re-launched while the user was still checked in, the timer started at zero (misleading).
**Now**: `fetchStatus` seeds `currentSessionSeconds` from `(Date.now() - new Date(session.checkInTime).getTime()) / 1000`.

### 4. Admin tab missing after cold-start
**Was**: 4 retry attempts × ≤ 15 s exhausted before Render's free-tier cold-start finished.
**Now**: 5 attempts, total ~50 s window. Plus a manual **Reload Admin Access** row in Settings.

### 5. PostgREST "Could not find the table" errors leaked as 500s
**Was**: Before migration 003 was applied, notifications / activity / audit endpoints crashed with 500.
**Now**: Fail-soft regex catches `relation does not exist | could not find the table | could not find a relationship` and returns empty arrays instead.

---

## Security risks still present

I'm being explicit about these so you can make informed decisions.

| Risk | Severity | Mitigation today | Real fix |
|---|---|---|---|
| **Face features stored only in AsyncStorage on the device, never verified server-side** | High | Native face match runs on the device. Backend trusts the frontend's identity check. | Move face features to a `user_face_data` table; require the client to upload features and have the server compare server-side. |
| **Web check-in/out has no biometric** — password re-entry is the only second factor | Medium | Stops the trivial "open my colleague's tab and check in for them" attack. | Add `face-api.js` (browser face detection) or require a second device confirmation. |
| **GPS can be spoofed** by rooted phones / dev tools | Medium | Geofence check enforced server-side. | Add server-side IP→geolocation reverse-check or vendor SDKs that detect mock locations. |
| **WiFi SSID can be impersonated** | Low | We only trust SSID, not BSSID. | Capture and validate BSSID (and signal strength) when possible. |
| **Service-role key is in `backend/.env`** | High if leaked | It is gitignored. Render keeps it as an env var. | Rotate immediately if anyone with access leaves the project. |
| **AdminGuard isn't wrapping every admin screen** | Low (cosmetic) | All `/api/admin/*` endpoints reject non-admin tokens server-side. | Wrap the remaining screens in `AdminGuard` so non-admins see a friendly denial instead of a half-rendered admin UI. |
| **No rate limit on Supabase Auth endpoints** | Medium | Supabase itself rate-limits sign-in attempts. | Add captcha for high-volume deployments. |
| **No CSRF protection** | Low | API is token-based (Bearer), not cookie-based. | If you later add cookie auth, add CSRF tokens. |
| **No content-security-policy header** | Low | The backend is JSON-only; the frontend is on a different origin. | Add CSP if you ever serve HTML from the backend. |

---

## Mock / dead / placeholder code

Files that **should be deleted or rewritten** before relying on the codebase further:

```
frontend/services/firebaseConfig.js   ← dead; no imports
firebase.json                          ← dead; old Firebase Hosting config
firestore.indexes.json                 ← dead; old Firestore config
frontend/theme/glossy.js               ← unused
.github-workflows-staged/              ← workaround that's now obsolete
```

Files that **work but are partially wired**:

```
frontend/services/biometricAuth.js     ← imported only for label text; not used to gate any flow
SettingsScreen.appVersion = '1.0.0'    ← hard-coded; not derived from /health
```

---

## Known limitations

- **Single-tenant.** No org isolation. If two companies share this instance, their users see each other's location list.
- **No offline mode.** Loss of connectivity = check-in fails. AsyncStorage caches face features and totals, not work-mode actions.
- **Free-tier cold starts.** First request after ~15 min idle hits a 30–50 s wake-up on Render's free plan. Visible as a brief "Server waking up…" banner in the app.
- **Reverse geocoding rate limit.** OSM Nominatim asks for max 1 req/sec. Heavy use can be throttled.
- **Notifications poll, don't push.** Up to 60 s delay for a new notification to appear.
- **Web face is just a password.** See [Security risks still present](#security-risks-still-present).

---

## Pending improvements / roadmap

Roughly in priority order:

- [ ] Server-side face verification (DB-stored features + comparison on `/api/checkin`)
- [ ] Replace dead Firebase artifacts with a single delete commit
- [ ] Wrap remaining admin screens in `AdminGuard`
- [ ] Migrate per-screen `Toast` usage to the global `ToastProvider`
- [ ] Skeleton loaders everywhere (replace plain spinners)
- [ ] Supabase Realtime for notifications and active sessions
- [ ] Admin UI to grant/revoke `user_location_access` directly
- [ ] Admin UI to edit role-permission mappings
- [ ] Wire `appVersion` to `/health.version`
- [ ] Add integration tests (today only unit tests)
- [ ] Service worker / installable PWA for web
- [ ] Push notifications (Expo Push)
- [ ] Multi-tenant separation
- [ ] TOTP-based 2FA via Supabase

---

## Troubleshooting

<details>
<summary><strong>Backend returns 500 right after migration</strong></summary>

If you see `Could not find the table 'public.X'`, you're hitting a code path that needs migration 003. Apply it:

```bash
cd backend && node scripts/apply-migrations-mgmt.js
```

Or paste `migrations/003_clean_architecture.sql` into Supabase SQL Editor.
</details>

<details>
<summary><strong>Admin tab doesn't show even though I'm an admin</strong></summary>

1. Open the deployed site, sign in, go to **Settings → Account → Reload Admin Access**.
2. If that fails, confirm `user_roles` has your row:
   ```sql
   SELECT * FROM user_roles WHERE user_id = '<your-uuid>';
   ```
3. If empty, run:
   ```bash
   cd backend && node scripts/make-admin.js your@email.com
   ```
</details>

<details>
<summary><strong>Camera permission was denied and the app keeps re-asking</strong></summary>

On iOS the OS marks the permission as permanently denied after the second refusal. The app detects `canAskAgain === false` and shows an **Open Settings** button. Tap it, toggle camera back on for AttendTrack, then return to the app.
</details>

<details>
<summary><strong>Frontend build fails with 'Cannot find module'</strong></summary>

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```
</details>

<details>
<summary><strong>Backend tests fail on Linux CI but pass locally</strong></summary>

This already bit us once. CI on Linux doesn't expand quoted globs in npm scripts the way Git Bash on Windows does. The `npm test` script lists explicit file paths now; if you add a new test, append it to the list in `backend/package.json`.
</details>

<details>
<summary><strong>"Permission denied to Ajain0311" when pushing CI workflow</strong></summary>

Your GitHub Personal Access Token is missing the `workflow` scope. Either:
- Regenerate a classic PAT with `repo` + `workflow`, **or**
- Regenerate a fine-grained PAT with `Contents: read+write` + `Workflows: read+write`.
</details>

<details>
<summary><strong>"Already checked in" when you know you aren't</strong></summary>

You have an orphaned active session (e.g. server killed mid-flow). Force a checkout:

```bash
TOKEN=...   # see "API examples" above
curl -X POST https://track-onme.onrender.com/api/checkout -H "Authorization: Bearer $TOKEN"
```
</details>

---

## Contribution guidelines

This is currently an internal project. If you have access:

1. **Branch from `main`**. Name: `fix/<short-desc>` or `feat/<short-desc>`.
2. **Small commits, descriptive messages.** Imperative mood ("Fix X", not "Fixed X").
3. **Run before pushing**:
   ```bash
   cd backend  && npm test                  # all 16 must pass
   cd frontend && npx expo export --platform web    # must succeed
   ```
4. **Don't commit `.env`**, `.netlify/`, `node_modules/`, or `frontend/dist/` (all gitignored).
5. **Update `CHANGELOG.md`** for user-visible changes.
6. **Document new features** in this README — keep the [Honest feature matrix](#honest-feature-matrix) current.
7. **CI must be green** before merging to `main`.

Code style:
- Prefer **adding** new files over deeply mutating existing ones.
- Use `AppError` + `asyncHandler` in every new backend route handler.
- Use the global `useToast()` for new screens (not the per-screen `Toast` component).
- Avoid introducing new dependencies if a 30-line internal helper would do.

---

## Version history

See [`CHANGELOG.md`](./CHANGELOG.md) for the full log. Short version:

| Version | Highlights |
|---|---|
| **v2.0.1** (current) | Security: server-side location authorization; web check-in requires password second factor; UI/UX skill polish (focus-visible rings, desktop ambient backdrop, scroll polish) |
| **v2.0.0** | Clean architecture refactor (controllers/services/middleware); migration 003 (RBAC + audit + activity + notifications); CSV export; live attendance; map preview; ErrorBoundary + ToastProvider; 16 unit tests + CI |
| **v1.x** | Original Firebase-then-Supabase build with timer, attendance, basic admin |

---

## License

Internal project — see the repo owner before redistributing.

---

## Security disclaimer

This app handles attendance data and physical location. **Do not deploy it as the sole proof of presence for legally or financially significant decisions** (payroll, time clocks, compliance reporting) without first:

1. Implementing server-side face verification (see roadmap).
2. Adding mock-location detection on Android.
3. Capturing WiFi BSSID + signal-strength fingerprints, not just SSID.
4. Auditing the [Security risks still present](#security-risks-still-present) section against your threat model.
5. Adding a paper / second-system backup (this is a single point of failure).

If you discover a vulnerability, contact the repo owner privately first — don't open a public issue.
