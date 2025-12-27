# NexusFS Frontend - Quick Start Guide

## Prerequisites

1. **Node.js 18+** installed
2. **Nexus RPC server** running on port 2026

## Step 1: Start the Nexus RPC Server

In the main Nexus directory:

```bash
cd ../nexus

# Activate virtual environment if needed
source .venv/bin/activate  # On macOS/Linux
# or
.venv\Scripts\activate  # On Windows

# Start the RPC server
python -m nexus.cli server --port 2026

# Or use the CLI
nexus server --port 2026
```

You should see:
```
Starting Nexus RPC server on 0.0.0.0:2026
Endpoint: http://0.0.0.0:2026/api/nfs/{method}
```

## Step 2: Install Frontend Dependencies

In a new terminal:

```bash
cd nexus-frontend
npm install
```

## Step 3: Configure Environment

The `.env` file is already created with defaults. You can connect to either:

### Option A: Local Server (Default)
```env
VITE_API_URL=http://localhost:2026
VITE_API_KEY=
```

### Option B: Deployed GCP Server
```env
VITE_API_URL=http://35.230.4.67:2026
VITE_API_KEY=
```

Edit the `.env` file to choose your backend server.

## Step 4: Start the Frontend

```bash
npm run dev
```

Open your browser to: **http://localhost:5173**

## Step 5: Test the Application

### Test File Browsing
1. The app should show your Nexus file system
2. Click on folders to navigate
3. Use the breadcrumb to go back

### Test File Upload
1. Click "Upload" button
2. Drag and drop a text file or click "Select Files"
3. Click "Upload" to confirm
4. File should appear in the list

### Test Folder Creation
1. Click "New Folder" button
2. Enter a folder name
3. Click "Create"
4. Folder should appear in the list

### Test Search
1. Enter a search query in the search bar
2. Toggle between "Name" (glob) and "Content" (grep)
3. Click "Search"
4. Results should appear

### Test File Operations
1. Click the edit icon (✏️) to rename a file
2. Click the download icon (⬇️) to download a file
3. Click the trash icon (🗑️) to delete a file
4. Click on a file to preview it

## Troubleshooting

### Cannot Connect to Server

**Error**: Network error or "Connection refused"

**Solution**:
1. Verify Nexus RPC server is running on port 2026
2. Check the `.env` file has correct `VITE_API_URL`
3. Restart the dev server after changing `.env`

### CORS Errors

**Error**: "Access to XMLHttpRequest has been blocked by CORS policy"

**Solution**:
The Nexus RPC server needs to allow CORS from your frontend origin.

Add CORS headers to the Nexus server or use a proxy.

### Files Not Loading

**Error**: Empty file list or errors in console

**Solution**:
1. Check Nexus server logs for errors
2. Verify API key if authentication is enabled
3. Check browser console for detailed error messages

### Environment Variables Not Loading

**Error**: API calls go to wrong URL

**Solution**:
1. Ensure `.env` file exists in `nexus-frontend/` directory
2. Environment variables must start with `VITE_`
3. Restart the dev server after changing `.env`

## Production Build

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

### Deploy Production Build

The `dist/` directory contains static files that can be deployed to:
- Netlify
- Vercel
- AWS S3 + CloudFront
- GitHub Pages
- Any static file hosting service

### Environment Variables for Production

Set environment variables in your hosting platform:
- `VITE_API_URL`: Your production Nexus server URL
- `VITE_API_KEY`: Your production API key (if needed)

## Development Tips

### Hot Module Replacement (HMR)

The dev server supports HMR. Changes to code will automatically reflect in the browser without full reload.

### TypeScript Errors

If you see TypeScript errors:
```bash
npx tsc --noEmit
```

This will check types without building.

### Clearing Cache

If you encounter strange behavior:
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Inspecting Network Requests

Open browser DevTools (F12) → Network tab to see API requests and responses.

## Keyboard Shortcuts (TODO)

These are planned but not yet implemented:
- `Ctrl/Cmd + U`: Upload files
- `Ctrl/Cmd + N`: New folder
- `Ctrl/Cmd + F`: Focus search
- `Delete`: Delete selected file
- `F2`: Rename selected file

## Getting Help

- **GitHub Issues**: https://github.com/nexi-lab/nexus/issues
- **Documentation**: See [README.md](./README.md)
- **Implementation Details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

## Next Steps

Once Phase 1 is tested and working:
1. Review [GitHub Issue #102](https://github.com/nexi-lab/nexus/issues/102) for Phase 2 requirements
2. Plan user authentication system
3. Design permission management UI
4. Implement access control features

---

**Happy file browsing! 🚀**
