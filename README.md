# Health Diary

A small, local-first health diary for remembering what happened between doctor visits. Write on your phone, attach prescriptions, and take a useful summary to your next appointment.

**[Read the HTML PRD](https://harshithagangappa.com/products/health-diary-prd.html)** · **[Use this template](https://github.com/harshithag841-gif/health-diary-template/generate)** · **[Fork the code](https://github.com/harshithag841-gif/health-diary-template/fork)** · **[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fharshithag841-gif%2Fhealth-diary-template)**

Built by [Harshitha Gangappa](https://harshithagangappa.com/#products). This is a clean, MIT-licensed template. It contains no personal diary records, prescriptions, credentials, or private deployment configuration.

## What it does

- Daily notes with autosave, optional mood, symptoms, medicines, and questions.
- Collapse completed notes and reopen them whenever you want to add more.
- Search past entries and choose any day to edit.
- Record doctor names, visit dates and times, and multiple visits on the same day.
- Attach prescription photos or PDFs and view or download them offline.
- Create an appointment report for a date range; print/save as PDF or download text.
- Download and restore a JSON backup, including prescription files.
- Install on your home screen as a progressive web app (PWA).

## Make your own copy

1. Select **Use this template** to create a fresh repository, or **Fork** to keep a connection for contributing changes upstream. Choose a private repository if you want your custom source private; GitHub forks of a public repository remain public, so use the template for a private copy.
2. In Vercel, import your new repository. Alternatively, the **Deploy to Vercel** link above starts the clone-and-deploy flow.
3. Keep the settings from `vercel.json`: framework **Other**, build command `node scripts/build.mjs`, output directory `dist`. No environment variables, database, login system, or paid API is required. Hosting is subject to your provider's plan and limits.
4. Open your stable production URL online once and wait for **Ready offline**. Add it to the home screen from Safari on iPhone or Chrome on Android.
5. Keep using the same URL and browser. Make a backup before changing domain, browser, or device, then restore it at the destination.

Deploy the diary on its own origin (for example, its own Vercel domain), separate from sites with analytics or other scripts. HTTPS is required for offline service workers outside localhost. Private source code does not make the hosted website private: anyone with the URL can load the app, but each browser has its own diary storage.

## Where your information lives

Diary entries, visits, and prescription files are stored in **IndexedDB in your browser**. Drafts and display preferences use localStorage. A service worker caches app code for offline use. The app does not send health content to a server and includes no analytics, advertisements, cloud sync, or third-party runtime requests. Exporting a backup/report or sharing a file is an explicit action you control.

Local storage is not a promise of absolute security. This app does not encrypt device storage or exported backups. Browser data can be cleared or evicted; private browsing may not retain it. Use a device lock and keep regular backups somewhere private. Your hosting provider still receives ordinary connection metadata such as IP addresses when it serves the app. Anyone who controls your deployment or scripts on the same origin can change the code; review changes before updating. This is a personal record keeper, not medical advice or an emergency service.

## Light and dark mode

Dark mode is the default. Use the sun/moon button next to Settings, or open **Settings → Appearance**, to choose Light mode or Dark mode. The choice is remembered in this browser, works offline, and applies to daily notes, past entries, doctor visits, prescription controls, and settings. Original prescription images are displayed without changing their colors. Printed appointment reports always use light styling.

The display preference is separate from health records and backups. Switching themes does not change saved notes or files. After an update, open the app online, close all diary tabs and installed-app windows, then reopen to activate the new offline version.

## Run locally

Requires Node.js 22 or newer. The app has no runtime dependencies and needs no npm install.

```sh
git clone https://github.com/harshithag841-gif/health-diary-template.git
cd health-diary-template
node scripts/build.mjs
node scripts/serve.mjs
```

Open `http://localhost:4173`. Build again after changes. Service-worker updates wait until old app windows close, protecting in-progress edits. Close all diary tabs and installed-app windows, then reopen online to activate an update.

## Implementation

| Part | Approach |
| --- | --- |
| Interface | Plain HTML, CSS, and JavaScript; mobile-first and keyboard usable |
| Records | IndexedDB v2 with separate `entries`, `visits`, and `prescriptions` stores |
| Attachments | Original files stored as blobs; visit lists load metadata only |
| Offline | Manifest + service worker; content-hashed asset cache |
| Backups | Versioned JSON; v1 compatibility; validated, atomic v2 restore |
| Hosting | Static `dist/` folder; Vercel security headers and restrictive CSP |

Prescription limits: up to 5 files per visit, 10 MB per file, 30 MB per visit. Supported types: JPEG, PNG, WebP, GIF, HEIC/HEIF, and PDF. Preview support depends on your browser; originals can be downloaded. Backup import limit: 150 MB. Reports list prescription filenames; they do not embed the original files. No automatic sync or scheduled backups.

`public/` contains the app. `scripts/build.mjs` checks JavaScript syntax and stamps the service worker version. `scripts/serve.mjs` serves the build with its security headers. `docs/prd.html` and `docs/prd.css` provide a portable product brief: open the HTML directly or host both files together.

An optional, feature-detected WebMCP tool can navigate to a diary date in supporting browsers. Normal operation does not depend on it.

## Verification and contributions

The browser checks use artificial data in an isolated Chrome profile. With Chrome and Playwright installed, start the local server, then run:

```sh
node scripts/smoke.mjs
node scripts/visits-smoke.mjs
```

Set `PLAYWRIGHT_MODULE_ROOT` to the directory containing Playwright if it is not locally installed. Tests cover mobile layouts, offline restarts, autosave, search, reports, backup round trips, IDB migration, prescription bytes, deletion cleanup, invalid input, and conflicting writes. Test results are ignored by Git.

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and [SECURITY.md](SECURITY.md) for responsible reports. Never submit real health information in issues, screenshots, or test fixtures.

## License

[MIT](LICENSE). You can use, modify, and share the template with the license notice retained.
