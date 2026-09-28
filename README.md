# StudySpark

A static, GitHub Pages-friendly study-guide-to-Blooket quiz builder. Students can create a local username/password account, save their own NVIDIA NIM key in that browser, add notes or upload text/PDF/DOCX/photo files, and generate a Blooket-style workbook with Nemotron 3 Super.

## Run locally

Open `index.html` in a modern browser, or serve this folder over HTTP. The app uses browser APIs and public CDN scripts for PDF/DOCX/photo extraction and Excel export. For password derivation and API requests, use HTTPS (GitHub Pages provides HTTPS) or `localhost`.

## Deploy to GitHub Pages

1. Push these files to the repository's default branch.
2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch and `/ (root)`, and save.
4. Visit the Pages URL and create a local account, then save an NVIDIA API key from [build.nvidia.com](https://build.nvidia.com/).

No build step or secrets configuration is required. The app calls `https://integrate.api.nvidia.com/v1/chat/completions` from the browser using `nvidia/nemotron-3-super-120b-a12b`.

## What it creates

The downloadable `.xlsx` workbook opens in Google Sheets and contains **no header row**. Each row has exactly seven cells in this order:

1. Question text
2. Answer 1
3. Answer 2
4. Answer 3
5. Answer 4
6. Time limit (`300`)
7. Correct answer number (`1`–`4`)

A CSV download is also available. The preview displays column labels for readability; those labels are not exported.

The app can extract selectable PDF text, DOCX and TXT text, and OCR text from common image files. Reference lookup uses Wikipedia's public API for short, topic-keyword queries. References are shown as candidate context, not independently verified sources. Prompts explicitly limit testable quiz facts to the supplied study guide.

## Important privacy and security limits

This is a **static browser app**, not a production authentication service. Usernames, salted PBKDF2 password hashes, saved NVIDIA keys, and session state live in that browser's `localStorage`; they do not sync across browsers or devices. The NVIDIA key is **not encrypted** and can be inspected by someone with access to that browser or its storage. Study-guide text is sent to NVIDIA to generate a quiz. Topic keywords are sent to Wikipedia for source lookup.

Do not use a shared device or save an API key you cannot risk exposing. GitHub Pages cannot keep a secret API key or provide private server-side account storage. For a public product, add a backend for real authentication, encrypted key handling, rate limiting, and server-side NVIDIA calls before collecting users' credentials or keys.

## Dependencies

Client-side libraries are loaded from public CDNs: SheetJS, PDF.js, Mammoth.js, and Tesseract.js. An internet connection is needed for those tools, NVIDIA requests, and the optional Wikipedia lookup. No user data is sent to a project-owned server.
