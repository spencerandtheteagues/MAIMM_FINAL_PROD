Temporary note: triggering Render deploy for branch devin/1758335424-oauth-theme-fixes.
# MYAIMEDIAMANAGER-V8.1 Railway Deployment Guide

This guide will walk you through deploying your project to Railway using the optimized Dockerfile.

## 1. Create a New Project on Railway

1.  Go to your Railway dashboard and click "New Project".
2.  Select "Deploy from GitHub repo" and choose your `MYAIMEDIAMANAGER-V8.1` repository.

## 2. Configure the Service

1.  When the service is created, go to the "Settings" tab.
2.  In the "Build" section, change the "Dockerfile Path" to `./Dockerfile.railway`.
3.  In the "Deploy" section, ensure the "Start Command" is empty. The `CMD` in the Dockerfile will be used.

## 3. Set Environment Variables

Go to the "Variables" tab and add all the necessary environment variables from your `.env.example` file.

## 4. Deploy

Railway will automatically trigger a new deployment with these settings. You can monitor the deployment in the "Deployments" tab.

This streamlined approach will ensure a successful deployment.
