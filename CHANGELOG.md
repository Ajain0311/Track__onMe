# CHANGELOG

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
