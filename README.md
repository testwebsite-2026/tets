# Financial Data Extractor

A tiny, static, no-backend web app that turns a receipt/invoice/purchase report into a clean Markdown table matching **your own Excel template** — ready to paste straight into a spreadsheet.

It's plain HTML/CSS/JS. It calls **Google's Gemini API** directly from your browser using your own **free** API key, so there is no server to host, deploy, or pay for.

## ✨ Features
- Two upload boxes: **Source Document** (receipt/invoice/report) and **Target Template** (your Excel layout)
- Supports images (PNG/JPG/WEBP), PDF, CSV, and TXT — plus a text box to paste template column headers directly
- Extracts *every* line item, cleans currency symbols/commas, formats dates as `YYYY-MM-DD`
- Leaves cells blank when data can't be found (never guesses/hallucinates fields)
- Outputs a clean Markdown table with a live preview, plus one-click **Copy**, **Download .csv**, and **Download .md**
- Nothing is stored or sent anywhere except directly to Anthropic's API

## 🚀 Quick start

### Option A — Just open it
Download/clone this repo and open `index.html` directly in your browser. That's it.

### Option B — Host it for free on GitHub Pages
1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

### Option C — Any static host
Drag the folder into Netlify/Vercel/Cloudflare Pages — no build step required.

## 🔑 Free API key
You'll need a **free** Gemini API key:

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with any Google account.
3. Click **Create API key** — no credit card, no payment info needed.
4. Copy the key (starts with `AIza...`) and paste it into the app.

Notes:
- Check "Remember in this browser" to save it in `localStorage` on your own device (nothing is sent to any third party — only to `generativelanguage.googleapis.com`).
- The free tier has daily/per-minute rate limits (varies by model — Flash models have the highest free limits). If you hit a rate limit, wait a bit or switch models in the dropdown.
- **Important:** because this app calls the API directly from the browser, your key is visible in your own browser's network requests. Don't share a deployed link to a *public* copy of this app with your key pre-filled, and don't commit your key to the repo. For team/production use, consider putting a small proxy server in front of the API instead so the key never reaches the browser.

## 📁 Project structure
```
financial-extractor/
├── index.html          # App UI (upload boxes, API key input, result view)
├── css/
│   └── style.css        # Styling
├── js/
│   └── app.js            # File handling, Claude API call, table/CSV rendering
└── README.md
```

## 🛠️ How it works
1. You upload the source document and target template (or paste headers as text).
2. The app reads each file as base64 (images/PDFs) or plain text (CSV/TXT).
3. It sends both, along with the extraction rules, to Gemini via `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
4. The response (a Markdown table) is rendered as an HTML preview and made available to copy or download as `.csv` / `.md`.

## 📝 Notes on template files
For image or PDF templates, Claude reads the columns visually. For native `.xlsx` templates, either:
- export a screenshot or PDF of the header row, or
- paste the column headers as plain text into the "Optional" text box (fastest and most reliable).

## License
MIT — do whatever you like with this.
