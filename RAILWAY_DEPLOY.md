# Deploying to Railway

This project is configured for a **Monolithic** deployment on [Railway.app](https://railway.app/).
This means the Frontend (React) and Backend (Rendering Engine) run in the same container, served by the same Express server.

## Why Railway?

This project requires **FFmpeg** and **Headless Chromium** for video rendering. Railway supports Docker deployments which allow us to install these system dependencies easily. Vercel and Netlify functions do not support these requirements natively.

## Prerequisites

1.  A GitHub Account
2.  A [Railway Account](https://railway.app/)
3.  This repository pushed to your GitHub

## Deployment Steps

1.  **Login to Railway**: Go to [Railway Dashboard](https://railway.app/dashboard).
2.  **New Project**: Click **+ New Project** > **Deploy from GitHub repo**.
3.  **Select Repository**: Choose your `pdf2tutorial` repository.
4.  **Configuration**:
    - Railway should automatically detect the `Dockerfile`.
    - No special build command is needed in Railway settings (the Dockerfile handles it).
5.  **Environment Variables**:
    - Go to the **Variables** tab in your Railway service.
    - Add `NODE_ENV` = `production` (Optional, Dockerfile sets it, but good practice).
    - You **DO NOT** need to set `VITE_API_URL` if you want the frontend to talk to the backend on the same domain (relative paths). The updated code handles this.
    - If you have specific API Keys (like `CLIENT_URL` for CORS protection), add them here.
      - `CLIENT_URL`: `https://your-railway-app-url.railway.app` (This allows the frontend to talk to the backend if strict CORS is on).
6.  **Deploy**: Railway will build the Docker container and deploy it. This might take 3-5 minutes due to compiling FFmpeg/Chromium layers.

## Updates

Every time you push to the `main` branch on GitHub, Railway will automatically redeploy the new version.

## Troubleshooting

- **Logs**: Check the **Deploy Logs** if the build fails.
- **OOM (Out of Memory)**: Video rendering is heavy. If the server crashes during render, try upgrading the Railway service plan to one with more RAM (Pro plan) or limiting the concurrency in `server.ts`.
