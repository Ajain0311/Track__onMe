# CHANGELOG

## v2.2.0 — ArcFace face verification + manager-approved enrollment (2026-06-28)

Replaces the old geometric-landmark face matcher (the source of false accepts —
a different person could clear check-in at 80%+) with deep **ArcFace-family
embeddings**, and adds enrollment governance + liveness.

### Face verification (rewritten)
- **On-device embeddings**: the app computes a MobileFaceNet (ArcFace-loss,
  128-d) embedding via TFLite (`react-native-fast-tflite`) and uploads only the
  vector — raw images never leave the device. New `services/faceEmbeddingService.js`
  (with a `.web.js` stub; web keeps the password second factor).
- **Server is the authority on the match**: `POST /api/face/verify` now compares
  the probe embedding against the user's approved enrollment by **cosine
  similarity** (`utils/faceUtils.js`), with a strict, env-tunable threshold
  (`FACE_MATCH_THRESHOLD`, default 0.55). Distance/similarity convention is
  documented to avoid inverting FAR/FRR.
- **Automatic verification**: the native check-in flow removed the manual
  "Verify" button — a single live frame is captured after a **blink** liveness
  challenge and verification + check-in happen automatically.
- **Liveness + quality gates**: passive anti-spoofing (MiniFASNet) plus an active
  blink challenge; rejects blur, low light, glare, faces too small, and multiple
  faces; ensures exactly one face.
- **Manager approval**: registration submits a `face_enrollment_requests` row
  (pending) and notifies admins/managers; the embedding only becomes active in
  `user_face_data` once approved. New `services/faceEnrollmentService.js`,
  `controllers/faceEnrollmentController.js`, `/api/admin/face-enrollments` routes,
  and `screens/admin/AdminFaceEnrollmentsScreen.js` (reachable by managers via
  Settings → Face Enrollments).
- **Migration 005** wipes all legacy geometric templates — every user re-enrolls
  (2 guided shots: front + slight turn) and is approved before checking in again.

### Unchanged (by design)
- Attendance / geofence / location APIs, the HMAC `faceToken` contract
  (`utils/signToken.js`), and web password verification are untouched — only the
  matching engine and enrollment workflow changed.

> Requires a new EAS native build + two bundled `.tflite` models
> (`frontend/assets/models/`, see its README).

## v2.0.1 — Security hardening + UX polish (2026-05-24)

### Security
- **Server-side location authorization** for `POST /api/checkin`: now requires
  a valid `locationId`, verifies the user has access (global / user_locations /
  user_location_access), and enforces a 1.5× geofence when GPS is provided.
  Closes a hole where any authenticated user could `POST {}` and create an
  attendance row from anywhere.
- **Web check-in/out second factor**: previously skipped entirely on web.
  Now requires the account password (re-auth via
  `supabase.auth.signInWithPassword`) before the request reaches the server.

### UI/UX (skill applied)
- `injectWebStyles()` in `App.js` — antialiased fonts, `focus-visible` rings,
  `cursor: pointer`, 180 ms button transition, `prefers-reduced-motion`
  respect, polished scrollbar, desktop ambient radial backdrop at ≥ 1024 px.
- New components: `ResponsiveContainer`, `PressableCard`.

### Documentation
- Rewrote `README.md` as an honest project document: separate working /
  partial / mock / planned matrices; explicit "security risks still present"
  section; troubleshooting and contribution guidelines; folder structure and
  API examples.

## v2.0.0 — Production-grade rewrite (2026-05)

Major refactor introducing clean architecture, RBAC, audit logging, notifications,
real-ish-time admin monitoring, CSV export, map previews, security headers,
unit tests and CI scaffolding.

### Backend

**Clean architecture**
- `controllers/`: every handler wrapped with `asyncHandler` so errors flow to the
  centralized `errorHandler` middleware
- `utils/AppError` typed errors (`badRequest`, `forbidden`, `notFound`, `validation`, …)
- `utils/logger` structured leveled logging (timestamps + JSON metadata)
- `middleware/requestLogger` access logs with duration
- `middleware/errorHandler` 5xx with stack, 4xx as warn
- `middleware/securityHeaders` (HSTS, X-Frame-Options, Permissions-Policy, …)
- `middleware/validate` schema-based body/params/query validation (zero-dep)
- `middleware/rateLimit` in-memory sliding-window limiter (per-IP + per-user)
- `middleware/requireRole` / `requirePermission` with backward-compat to legacy text `role`

**RBAC (migration 003)**
- `roles` table (super_admin / admin / manager / user, seeded)
- `permissions` table + `role_permissions` junction (19 atomic permissions)
- `user_roles.role_id` FK alongside legacy text `role`
- Routes use `requireRole(['admin','manager'])`; super_admin bypasses all checks

**Audit / activity / notifications**
- `audit_logs` table — sensitive admin actions (location.create, role.update, …)
- `activity_logs` table — user activity timeline (check_in, check_out, login, …)
- `notifications` table — per-user inbox (location_request.approved, …)
- Endpoints: `GET /api/admin/audit-logs`, `GET /api/activity`, `GET /api/notifications`
- Mutations: `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
- All three gracefully return empty arrays when migration 003 isn't applied yet

**Live attendance (admin)**
- `GET /api/admin/active-sessions` returns currently-checked-in users + elapsed time
- AdminLiveAttendanceScreen polls every 15 s

**Misc**
- `GET /health` (uptime + version, no auth)
- `POST /api/me/track-login` records a login activity once per session
- 404 handler returns typed JSON error
- Crash-visibility hooks for unhandled rejection / uncaught exception
- Removed dead Firebase code

**Tests (16 cases, zero dependencies)**
- `node --test` runs everything via `npm test`
- Coverage: AppError, validate (8 cases), rateLimit (3 cases), csvExport (3 cases)

**Scripts**
- `scripts/apply-migrations.js` — applies all SQL files via `pg` (needs `SUPABASE_DB_URL`)
- `scripts/make-admin.js` — upsert a user as admin

### Frontend

**Reusable components**
- `ToastProvider` — global toast queue via React Context (replaces per-screen Toast)
- `EmptyState`, `LoadingState`, `ScreenHeader` — consistent UI primitives
- `AdminGuard` — wraps admin screens so non-admins see a friendly denial
- `ErrorBoundary` — top-level crash recovery screen
- `MapPreview` — Leaflet + OSM tiles on web, coordinate fallback on native (free)

**New screens**
- `NotificationsScreen` — inbox with mark-read, mark-all-read, formatted relative times
- `ActivityScreen` — vertical activity timeline
- `AdminAuditLogsScreen` — paginated admin audit trail
- `AdminLiveAttendanceScreen` — real-ish-time who's-checked-in view
- `ChangePasswordScreen` — Supabase password update with validation

**Existing screens**
- LoginScreen: "Forgot password?" link → `supabase.auth.resetPasswordForEmail`
- Dashboard: notification bell with unread badge (polls 60 s while focused)
- Dashboard: timer now seeded with elapsed time on app restart (was always 0:00:00)
- AdminUsersScreen: filter chips (All / Active now / Today / Admins) + role cycle
- AdminLocationFormScreen: live MapPreview reflecting lat/lng/radius
- AdminLocationRequestsScreen: MapPreview in review modal + accuracy/capture time
- LocationRequestScreen: reverse-geocode address + MapPreview + GPS metadata
- HistoryScreen / AdminUserDetailScreen: CSV export buttons
- SettingsScreen: ACCOUNT section (Change Password + Reload Admin Access) +
  INBOX section (Notifications + Activity)

**Utilities**
- `utils/csvExport` — cross-platform CSV export (web: Blob+download, native: Share)
- `services/locationService.reverseGeocode` — OSM Nominatim on web, Expo on native

### Bug fixes from v1
- Timer reset to 0 when re-opening the app while checked in (now resumes elapsed)
- Timer didn't refresh on screen focus (now `useFocusEffect` silently re-syncs status)
- Admin tab not appearing on cold-start (extended retry to ~50 s + manual reload)
- Camera permission UX (canAskAgain + Open Settings deep-link)
- Migration 003 fail-soft handling for both Postgres-native and PostgREST errors

### Deployment / DevOps
- `netlify.toml` — base=frontend, command=`expo export --platform web`, publish=dist
- Backend on Render auto-deploys from `main`
- `.github-workflows-staged/ci.yml.txt` ready to enable backend tests + frontend
  build on every push (requires PAT with `workflow` scope to install)

### URLs
- Frontend: <https://attendeyesonme.netlify.app>
- Backend:  <https://track-onme.onrender.com/health>
