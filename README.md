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

**Download spreadsheet** fills the official Blooket import template that lives in this repo (`Blooket_Spreadsheet_Import_Template.xlsx`). The template's Blooket logo, header row, colors, borders, column widths, and sheet name are kept exactly as-is; the example questions are removed and the generated questions are written starting on row 3:

| Column | Contents |
| --- | --- |
| A | Question # (template numbering) |
| B | Question text |
| C–F | Answer 1 – Answer 4 |
| G | Time limit (`300`) |
| H | Correct answer number (`1`–`4`) |

The file opens in Google Sheets (File → Import, or drag it into Drive) and can be uploaded directly to Blooket's spreadsheet import. Keep the template file in the same folder as `index.html` — the app fetches it at download time. If it can't be loaded (for example when `index.html` is opened straight from disk via `file://`), the app falls back to a plain 7-column sheet.

**Download CSV** gives just the seven cells per row (question, 4 answers, time limit, correct answer number) with no header row, for copying and pasting into the template yourself.

The app can extract selectable PDF text, DOCX and TXT text, and OCR text from common image files. Reference lookup uses Wikipedia's public API for short, topic-keyword queries. References are shown as candidate context, not independently verified sources. Prompts explicitly limit testable quiz facts to the supplied study guide.

## Important privacy and security limits

This is a **static browser app**, not a production authentication service. Usernames and passwords have no length or character rules. Usernames, salted PBKDF2 password hashes, saved NVIDIA keys, and session state live in that browser's `localStorage`; they do not sync across browsers or devices. The NVIDIA key is **not encrypted** and can be inspected by someone with access to that browser or its storage. Study-guide text is sent to NVIDIA to generate a quiz. Topic keywords are sent to Wikipedia for source lookup.

Do not use a shared device or save an API key you cannot risk exposing. GitHub Pages cannot keep a secret API key or provide private server-side account storage. For a public product, add a backend for real authentication, encrypted key handling, rate limiting, and server-side NVIDIA calls before collecting users' credentials or keys.

## Dependencies

Client-side libraries are loaded from public CDNs: JSZip (fills in the Blooket template), SheetJS (fallback export), PDF.js, Mammoth.js, and Tesseract.js. An internet connection is needed for those tools, NVIDIA requests, and the optional Wikipedia lookup. No user data is sent to a project-owned server.
