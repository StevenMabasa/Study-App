# Quick Start Guide - Study App

## Step 1: Verify Your Setup

Make sure you're in the project directory:
```powershell
cd C:\Users\steve\Desktop\Study_App
```

## Step 2: Check Your API Key

Your `.env` file should be in the `server` folder with your Gemini API key:
```
GEMINI_API_KEY=your-new-gemini-api-key
GEMINI_GENERATION_MODEL=gemini-2.5-flash-lite
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite
PORT=5000
```

For production deployments:
- Render backend: set `GEMINI_API_KEY` in the Render service environment variables.
- Render backend: optional but recommended: set `GEMINI_GENERATION_MODEL=gemini-2.5-flash-lite` and `GEMINI_CHAT_MODEL=gemini-2.5-flash-lite` to reduce request pressure on the free tier.
- Netlify frontend: do not add the Gemini key there. The frontend only needs `REACT_APP_API_URL` pointing at your Render backend URL.

## Step 3: Run the App

You have **two options**:

### Option A: Run Both Together (Easiest)
Open **ONE** terminal/PowerShell window and run:
```powershell
npm run dev
```

This will start both the backend (server) and frontend (client) at the same time.

### Option B: Run Separately (If Option A doesn't work)
Open **TWO** terminal/PowerShell windows:

**Terminal 1 - Backend Server:**
```powershell
cd C:\Users\steve\Desktop\Study_App
npm run server
```

**Terminal 2 - Frontend Client:**
```powershell
cd C:\Users\steve\Desktop\Study_App
npm run client
```

## Step 4: Open the App

Once running, open your web browser and go to:
- **http://localhost:3000**

The backend will be running on **http://localhost:5000** (you don't need to open this directly).

## Troubleshooting

### If you see "port already in use" errors:
- Close any other apps using ports 3000 or 5000
- Or change the ports in the configuration files

### If the frontend can't connect to the backend:
- Make sure the backend is running (check Terminal 1)
- Check that the server shows "Server running on port 5000"

### If you see API key errors:
- Make sure `server/.env` exists and has your Gemini API key
- The key should start with `AIza`
- If Google says the key was leaked, create a new key, update `GEMINI_API_KEY` on Render, and redeploy or restart the backend service

## What to Expect

1. You'll see the upload page
2. Upload a PDF or image file with lecture slides
3. Wait for the quiz to generate (may take 30-60 seconds)
4. Take the quiz
5. See your results with correct answers


