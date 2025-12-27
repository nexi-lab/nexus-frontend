# Firebase Hosting Deployment Guide

This guide explains how to deploy the NexusFS frontend to Firebase Hosting with automatic GitHub Actions CI/CD.

## Prerequisites

1. **Firebase/GCP Project**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Note your project ID

2. **Firebase CLI**
   - Already installed at `/opt/homebrew/bin/firebase`
   - Login: `firebase login`

3. **GitHub Repository**
   - Repository: `https://github.com/nexi-lab/nexus-frontend.git`

## Initial Setup

### 1. Configure Firebase Project

Update [.firebaserc](.firebaserc) with your Firebase project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### 2. Test Local Deployment

Build and preview locally:

```bash
npm run build
firebase serve
```

Deploy manually to test:

```bash
firebase deploy
```

Your app will be live at `https://YOUR_PROJECT_ID.web.app`

### 3. Set Up GitHub Actions Secrets

To enable automatic deployments, add these secrets to your GitHub repository:

#### a. Create Firebase Service Account

```bash
# Login to Firebase
firebase login

# Generate a service account key (Option 1: Using Firebase CLI)
firebase init hosting:github

# OR Option 2: Manual setup
# 1. Go to https://console.firebase.google.com/project/YOUR_PROJECT_ID/settings/serviceaccounts
# 2. Click "Generate new private key"
# 3. Save the JSON file
```

#### b. Add GitHub Repository Secrets

Go to: `https://github.com/nexi-lab/nexus-frontend/settings/secrets/actions`

Add these secrets:

1. **FIREBASE_SERVICE_ACCOUNT**
   - Value: The entire JSON content of the service account key file
   - Example:
     ```json
     {
       "type": "service_account",
       "project_id": "your-project-id",
       "private_key_id": "...",
       "private_key": "...",
       ...
     }
     ```

2. **FIREBASE_PROJECT_ID**
   - Value: Your Firebase project ID (e.g., `nexus-frontend-prod`)

3. **VITE_API_KEY** (Optional)
   - Value: API key for Nexus backend if required
   - Leave empty if not using authentication

## Automatic Deployments

Once configured, deployments happen automatically:

1. **Push to `main` branch**
   ```bash
   git push origin main
   ```

2. **GitHub Actions will:**
   - Checkout code
   - Install dependencies
   - Build production bundle with `VITE_API_URL=http://35.230.4.67:2026`
   - Deploy to Firebase Hosting

3. **Monitor progress:**
   - GitHub Actions tab: https://github.com/nexi-lab/nexus-frontend/actions
   - Deployment takes ~2-3 minutes

4. **Access your app:**
   - Primary URL: `https://YOUR_PROJECT_ID.web.app`
   - Custom domain: Configure in Firebase Console

## Manual Deployment (Alternative)

If you prefer manual deployments:

```bash
# Build with production config
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

## Configuration Files

### [firebase.json](firebase.json)
- Configures Firebase Hosting
- Sets `dist` as public directory
- Enables SPA routing (all routes → index.html)
- Optimizes cache headers for assets

### [.firebaserc](.firebaserc)
- Links to your Firebase project
- Update with your actual project ID

### [.env.production](.env.production)
- Production environment variables
- Backend API: `http://35.230.4.67:2026`

### [.github/workflows/firebase-deploy.yml](.github/workflows/firebase-deploy.yml)
- GitHub Actions workflow
- Triggers on push to `main`
- Builds and deploys automatically

## Troubleshooting

### Build Fails in GitHub Actions

Check the build logs in GitHub Actions. Common issues:
- Missing secrets (FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID)
- TypeScript errors (fix with `npm run build` locally)
- Dependency issues (try `npm ci` locally)

### Deployment Succeeds but Site is Broken

1. **API Connection Issues:**
   - Check if backend is accessible: `curl http://35.230.4.67:2026/health`
   - Verify CORS settings on backend allow Firebase domain

2. **Routing Issues:**
   - Firebase rewrites should handle all routes → [firebase.json](firebase.json)
   - Check browser console for errors

3. **Environment Variables:**
   - Ensure `.env.production` values are correct
   - GitHub Actions workflow passes `VITE_API_URL` correctly

### Firebase CLI Issues

```bash
# Re-login
firebase logout
firebase login

# Check current project
firebase projects:list
firebase use YOUR_PROJECT_ID
```

## Security Notes

1. **API Endpoint Security:**
   - Currently using HTTP: `http://35.230.4.67:2026`
   - **RECOMMENDED:** Migrate to HTTPS for production
   - Consider setting up Cloud Load Balancer with SSL

2. **Secrets Management:**
   - Never commit `.env` or service account keys to Git
   - Use GitHub Secrets for sensitive data
   - `.firebaserc` is gitignored (safe to have project ID in it)

3. **CORS Configuration:**
   - Backend must allow requests from Firebase domain
   - Add `https://YOUR_PROJECT_ID.web.app` to CORS allowlist

## Custom Domain (Optional)

1. Go to Firebase Console → Hosting → Add custom domain
2. Follow DNS setup instructions
3. Firebase provides free SSL certificate
4. Example: `nexus.yourdomain.com`

## Cost Estimate

Firebase Hosting free tier includes:
- 10 GB storage
- 360 MB/day bandwidth
- Free SSL certificate

Typical costs for low-medium traffic: **$0-5/month**

## Support

- Firebase Docs: https://firebase.google.com/docs/hosting
- GitHub Actions Logs: https://github.com/nexi-lab/nexus-frontend/actions
- Nexus Backend: http://35.230.4.67:2026
