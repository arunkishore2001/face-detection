# Face Sorter (web)

Sort photos into one folder per person, entirely in the browser.

1. **Choose photos**: a Google Drive folder link, or photos/folders from this device.
2. **Name the faces**: every different face is shown as a card; type a name (leave strangers empty).
3. **Save**: one folder per person. Photos with **3 or more people** can also go into a **Group Photos** folder.
   Destinations: inside the Drive folder (`Sorted by Face/…`), upload to another Drive folder,
   a folder on this computer (Chrome/Edge), or a ZIP download.

Face finding (YuNet) and recognition (SFace) run in the browser with ONNX Runtime Web. Photos never go to a server;
they only travel between the user's device and their own Google Drive. Names are remembered in the browser
(IndexedDB) so known people are filled in next time.

## Run locally

```
npm install
copy .env.example .env.local      (then put your Google client ID in it)
npm run dev
```

Open http://localhost:5173.

## Google setup (one time)

In https://console.cloud.google.com, in your Face Sorter project (Drive API already enabled):

1. **Google Auth Platform → Clients → Create client**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173`
     - `https://YOUR-APP.vercel.app` (add after the first deploy)
   - No redirect URIs are needed.
2. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). It is not secret.
3. **Audience**: add users as test users, or click **Publish app** so anyone (up to 100 users without
   Google verification) can sign in after the "unverified app" warning.

## Deploy to Vercel

**Option A – GitHub (recommended)**
1. Push this folder to a GitHub repository.
2. On https://vercel.com → **Add New → Project** → import the repository.
   - If the repo contains more than this app, set **Root Directory** to `face-sorter-web`.
   - Framework preset: **Vite** (detected automatically).
3. **Environment Variables**: `VITE_GOOGLE_CLIENT_ID` = your client ID.
4. **Deploy**. Then add the `https://….vercel.app` address to the client's Authorized JavaScript origins.

**Option B – Vercel CLI**
```
npx vercel                       (first time: log in and link the project)
npx vercel env add VITE_GOOGLE_CLIENT_ID
npx vercel --prod
```

## Project layout

```
public/models/          YuNet (flexible input size) and SFace ONNX models
scripts/copy-ort.js     copies ONNX Runtime's .wasm files into public/ort on dev/build
src/lib/faceWorker.js   web worker: find faces, align, 128-number fingerprint
src/lib/faces.js        worker pool, scanning, face cards
src/lib/cluster.js      grouping (average-linkage clustering, re-cut instantly by the slider)
src/lib/google.js       Google sign-in + Drive (list, download, folders, copy, upload)
src/lib/save.js         save to Drive / computer folder / ZIP
src/lib/people.js       remembered people (IndexedDB)
src/components/         the three steps, progress, dialogs
```

## Notes

- Keep the tab open while it works. Speed is roughly 0.2–0.5 s per photo on a laptop.
- The Google token lasts one hour; very long jobs may ask you to sign in again.
- Google Drive copies count toward the user's storage.
- HEIC (iPhone) photos are converted in the browser before scanning.
