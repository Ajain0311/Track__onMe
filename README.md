# 📱 AttendTrack — Full Stack Attendance App

A complete **React Native (Expo) + Node.js/Express + Firebase** attendance tracking app.

---

## 📁 Project Structure

```
VibeCoder/
├── backend/                  # Express API
│   ├── controllers/
│   │   └── attendanceController.js
│   ├── middleware/
│   │   └── auth.js           # Firebase token verification
│   ├── routes/
│   │   └── attendance.js
│   ├── services/
│   │   ├── firebase.js       # Admin SDK init
│   │   └── firestoreService.js
│   ├── .env.example
│   ├── .gitignore
│   ├── index.js
│   └── package.json
│
└── frontend/                 # React Native (Expo)
    ├── components/
    │   └── AttendanceCard.js
    ├── screens/
    │   ├── LoginScreen.js
    │   ├── DashboardScreen.js
    │   └── HistoryScreen.js
    ├── services/
    │   ├── api.js            # Axios + auth interceptor
    │   ├── authService.js    # Firebase client auth
    │   └── firebaseConfig.js # Firebase client config
    ├── store/
    │   └── authStore.js      # Zustand global state
    ├── App.js
    ├── app.json
    ├── babel.config.js
    └── package.json
```

---

## 🚀 Setup Instructions

### Step 1 — Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a project → enable **Firestore** and **Authentication (Email/Password)**
3. Create an **Admin service account**:
   - Project Settings → Service Accounts → Generate new private key
   - Note: `projectId`, `clientEmail`, `privateKey`
4. Get your **Web App config**:
   - Project Settings → General → Add App (Web)
   - Copy the `firebaseConfig` object

---

### Step 2 — Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file:
```env
PORT=5000
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

Run locally:
```bash
npm start
# or for hot reload:
npm run dev
```

---

### Step 3 — Frontend Setup

1. Open `frontend/services/firebaseConfig.js` and paste your Firebase web app config.
2. Open `frontend/services/api.js` and set `BASE_URL`:
   - **Local dev:** `http://YOUR_LOCAL_IP:5000/api` (find IP via `ipconfig`)
   - **After Render deploy:** `https://your-app.onrender.com/api`

```bash
cd frontend
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone.

### Run the app in the **browser** (web)

The repo includes web support. Install deps (once), then start web:

```powershell
cd frontend
npm.cmd install
npm.cmd run web
```

Or: `npx.cmd expo start --web`

When Metro starts, the terminal shows **`Waiting on http://localhost:8081`** (or another port if 8081 is busy, e.g. **8082**). **Open that exact URL in Chrome or Edge** — that is your frontend.

- **Backend** must still be running separately at **`http://localhost:5000`** (see Step 2). The web app calls **`http://localhost:5000/api`** automatically in development.

If web says missing dependencies, from `frontend/` run:

`npx.cmd expo install react-dom react-native-web @expo/metro-runtime`

### Web sign-in: `POST identitytoolkit … 400 (Bad Request)`

Usually one of these:

1. **API key restrictions** — Open [Google Cloud Credentials for this project](https://console.cloud.google.com/apis/credentials?project=attendance-ba6294), click your **Browser key** (same prefix as `apiKey` in Firebase config). Under **Application restrictions**, choose **None** for local testing, *or* **HTTP referrers** and add `http://localhost:*`, `http://127.0.0.1:*`, and your Expo URL if different.

2. **Use a Web app config** — In [Firebase Console](https://console.firebase.google.com/) → **Project settings** → **Your apps** → add a **Web** app (`</>`). Copy `apiKey` and `appId` (they look like `1:…:web:…`). Create `frontend/.env`:

   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=paste_web_apiKey_here
   EXPO_PUBLIC_FIREBASE_APP_ID=paste_web_appId_here
   ```

   Restart Expo after saving `.env`.

---

## ☁️ Deploying Backend to Render

1. Push `backend/` folder to a GitHub repository
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo and configure:
   | Setting | Value |
   |---------|-------|
   | Environment | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
4. Add Environment Variables (same as `.env` above)
5. Deploy → copy the `.onrender.com` URL into `frontend/services/api.js`

---

## 📡 API Reference

All routes require `Authorization: Bearer <firebase_id_token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/api/checkin` | Check in (creates record) |
| POST | `/api/checkout` | Check out (closes record) |
| GET | `/api/attendance/daily` | Per-day totals + sessions (for History) |
| GET | `/api/attendance` | Get all raw records for user |
| GET | `/api/status` | Check if user is currently in |

---

## 🔐 Firestore Structure

**Collection:** `attendance`

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Firebase UID |
| `checkInTime` | string | ISO timestamp |
| `checkOutTime` | string \| null | ISO timestamp or null |
| `totalDuration` | number \| null | Duration in minutes |
| `date` | string | YYYY-MM-DD |

### Firestore composite indexes (CLI)

Deploy from the **repo root** (`VibeCoder/`), not `backend/` or `frontend/`:

1. Log in once: `npx firebase-tools@13 login`
2. Deploy indexes: `npx firebase-tools@13 deploy --only firestore:indexes`

The file `.firebaserc` sets the default project to `attendance-ba6294`. If you use another Firebase project, either edit `.firebaserc` or pass `--project YOUR_PROJECT_ID`.

**If deploy still fails:** you do not need the CLI. The first time a query needs an index, the **backend error log** or **Firebase Console** shows a link to create that index in one click.

**Common error — “No currently active project”:** fixed by having `.firebaserc` in the repo root (or run `firebase use --add` and pick your project).

---

## Windows: `npm` / `npx` fails in PowerShell

If you see **`running scripts is disabled on this system`** / **`PSSecurityException`**, PowerShell is blocking Node’s `npm.ps1` and `npx.ps1`.

**Quickest fix — use the `.cmd` shims** (same as `npm` / `npx`, no settings change):

```powershell
cd d:\VibeCoder\backend
npm.cmd install
npm.cmd run check:firebase
npm.cmd run seed:user
npm.cmd run dev
```

```powershell
cd d:\VibeCoder\frontend
npm.cmd install
npx.cmd expo start
```

From the repo root, Firebase CLI:

```powershell
cd d:\VibeCoder
npx.cmd firebase-tools@13 login
npx.cmd firebase-tools@13 deploy --only firestore:indexes
```

**Alternative — allow scripts for your user** (one-time, in PowerShell):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then `npm` and `npx` work as usual. **Or** use **Command Prompt (`cmd.exe`)** instead of PowerShell.
