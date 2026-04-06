# Vibecoder Backend

This is a production-ready Express.js backend designed to be fully deployable on Render and seamlessly connect to a React Native app. It uses Firebase Admin SDK securely loaded from environment variables.

## Features Included

- Express.js with dynamic connection port.
- CORS enabled for mobile and cross-origin requests.
- Secure Firebase Admin setup (No hardcoded JSON!).
- Global Error Handling & Request Logging.
- Health check route `/` returning `API is running`.

---

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory and add the following:
   ```env
   PORT=5000
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
   ```
   *(Note: Ensure your private key is enclosed in quotes so the literal `\n` characters are read correctly.)*

3. Start the local server:
   ```bash
   npm start
   ```

---

## Deployment Instructions (Render)

### 1. Push to GitHub
1. Initialize a Git repository if you haven't already:
   ```bash
   git init
   git add .
   git commit -m "Initialize production-ready backend"
   ```
2. Push this code to a newly created GitHub repository.
3. **Important Check:** Make sure `.env` and any service account `.json` files are **NOT** committed. The `.gitignore` is already set up to ignore them.

### 2. Connect to Render
1. Create an account on [Render](https://render.com) and click **"New +" -> "Web Service"**.
2. Connect your GitHub account and select your backend repository.
3. Fill in the required deployment details:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Under **"Environment Variables"**, add the variables from your `.env` file:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (Paste the exact key from the Firebase console, carefully maintaining the newline characters structure)

### 3. Deploy
1. Click **Create Web Service**.
2. Render will trigger the build and deployment. Wait for it to show the status **"Live"**.
3. Visit the provided `.onrender.com` URL. You should see `API is running`.
