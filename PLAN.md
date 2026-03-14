# Bulk IP Lookup Tool — Implementation Plan

## Tech Stack

**Node.js + Express backend** + **Vanilla HTML/CSS/JS frontend** (no build step, no framework)

---

## Architecture

```
Browser
  └── paste log → regex extracts IPs client-side → POST /api/lookup
        ↓
Express Backend
  └── chunks IPs into batches of 40
  └── per IP: ip-api.com (primary) + ipwho.is (fallback) + node-whois (parallel)
  └── normalizes to spur-style JSON shape
        ↓
Browser
  └── renders result cards + export (JSON/CSV)
```

---

## IP Data Sources (all free)

| Source | Provides | Limit |
|---|---|---|
| **ip-api.com** | ASN, org, location, datacenter/proxy/mobile flags | 45 req/min |
| **ipwho.is** | Same, HTTPS, fallback | Generous |
| **node-whois** | Raw WHOIS, org/abuse info | No limit |

`infrastructure` field is derived from ip-api flags:
- `hosting: true` → `DATACENTER`
- `mobile: true` → `MOBILE`
- `proxy: true` → `ANONYMOUS_PROXY`
- otherwise → `RESIDENTIAL`

---

## Result Shape (spur-style)

```json
{
  "ip": "8.8.8.8",
  "as": { "number": 15169, "organization": "Google LLC" },
  "organization": "Google LLC",
  "infrastructure": "DATACENTER",
  "location": { "city": "Anycast", "state": "Anycast", "country": "ZZ" },
  "whois_raw": "..."
}
```

---

## File Structure

```
BulkIP/
├── package.json
├── server.js              # Express + /api/lookup endpoint
├── lib/
│   ├── extractIPs.js      # IPv4/IPv6 regex (use ip-regex npm for correctness)
│   ├── lookupIP.js        # Fan-out to ip-api + whois
│   └── normalizeResult.js # Maps raw API responses to spur JSON shape
└── public/
    ├── index.html
    ├── style.css
    └── app.js             # Client-side extract, fetch, render, export
```

---

## Implementation Steps

### Step 1 — Initialize the project
```
npm init -y
npm install express axios node-whois ip-regex
```

### Step 2 — `lib/extractIPs.js`
- Use the `ip-regex` npm package for RFC-correct IPv4 and IPv6 matching
- Deduplicate results via `Set`
- Filter loopback (`127.x`, `::1`) and link-local (`169.254.x`, `fe80::`) addresses

### Step 3 — `lib/lookupIP.js`
- Call ip-api.com with fields: `status,message,country,regionName,city,org,as,asname,mobile,proxy,hosting,query`
- If rate-limited (`status === 'fail'`), fall back to ipwho.is
- Call `node-whois` in parallel via `Promise.allSettled` with a 5s timeout
- Return combined raw object

### Step 4 — `lib/normalizeResult.js`
- Map combined raw data to the spur-style shape above
- Derive `infrastructure` from ip-api boolean flags
- Include `whois_raw` as optional supplementary field

### Step 5 — `server.js`
- `GET /` serves `public/index.html`
- `POST /api/lookup` accepts `{ ips: string[] }`
- Chunk into batches of 40 with a 1.5s pause between batches (respects ip-api 45 req/min limit)
- In-memory cache (`Map`) keyed by IP with a 10-minute TTL
- Return `{ results: NormalizedResult[] }`

### Step 6 — `public/index.html` + `public/style.css`
- Large textarea: "Paste raw logs here"
- Live counter showing "X IPs detected" (debounced 300ms)
- "Look Up" button
- Result cards with:
  - IP as card title
  - Colored infrastructure badge (red=DATACENTER, green=RESIDENTIAL, orange=MOBILE)
  - ASN number and org
  - Location: city, state, country
  - Collapsible `<details>` block for raw WHOIS
- Toolbar: "Copy JSON", "Export CSV", "Clear"

### Step 7 — `public/app.js`
- `extractIPs(text)` — same regex logic as server-side
- Debounced `input` listener updates IP counter
- `handleSubmit()` — calls `POST /api/lookup`, shows loading state with progress ("Looking up 3 of 47...")
- `renderResults(results)` — builds card DOM elements
- `exportCSV(results)` / `copyJSON(results)` — export utilities

### Step 8 — `package.json` scripts
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js"
}
```
`node --watch` is built into Node 18+ — no nodemon needed.

---

## Key Considerations

- **Rate limits**: Batching 40 IPs per chunk with a 1.5s pause keeps under ip-api's 45/min free limit. Show per-IP progress in the UI for large lists.
- **IPv6**: Use the `ip-regex` npm package rather than hand-rolling the regex — full RFC compliance is complex.
- **WHOIS**: Treat as supplementary only. Hard 5s timeout. Surface raw output in a collapsible block rather than parsing every registry's format.
- **Private IPs**: Detect RFC 1918 / loopback client-side and skip the server call entirely.
- **CORS**: Express serves both the HTML and API from the same origin — no CORS configuration needed.

---

## Deployment: Vercel (Free Hobby Plan)

Vercel serves `public/` as a static CDN automatically. The Express backend is wrapped as a single serverless function.

### Code changes required

**1. Export the app from `server.js`** — remove the `app.listen` call at the bottom and export the app instead, with a guard so local `npm start` still works:

```js
// bottom of server.js — replace app.listen(...) with:
if (require.main === module) {
  app.listen(PORT, () => console.log(`BulkIP running at http://localhost:${PORT}`));
}
module.exports = app;
```

Also remove the `express.static` middleware from `server.js` — Vercel serves `public/` natively and this line is unnecessary in production:
```js
// remove this line from server.js:
app.use(express.static(path.join(__dirname, 'public')));
```

**2. Create `api/index.js`** — Vercel treats any file in `api/` as a serverless function:

```js
// api/index.js
module.exports = require('../server');
```

**3. Add `vercel.json`** — routes `/api/*` to the serverless function; everything else is served from `public/`:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

### Updated file structure

```
BulkIP/
├── vercel.json
├── package.json
├── server.js
├── api/
│   └── index.js        # Vercel serverless entry point
├── lib/
│   ├── extractIPs.js
│   ├── lookupIP.js
│   └── normalizeResult.js
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

### Deployment steps

**Step 1 — Initialize git repo**
```bash
# Create .gitignore
echo "node_modules/\n*.log" > .gitignore

git init
git add .
git commit -m "Initial commit"
```

**Step 2 — Push to GitHub**
```bash
# Create a new empty repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/BulkIP.git
git branch -M main
git push -u origin main
```

**Step 3 — Deploy on Vercel**
1. Sign up at **vercel.com** with your GitHub account (no credit card)
2. Click **Add New > Project**, import the `BulkIP` repo
3. Leave all settings as defaults — Vercel auto-detects Node.js
4. Click **Deploy** — live in ~1 minute at `https://bulkip.vercel.app`

Every subsequent `git push` to `main` auto-deploys.

### Gotchas

- **No persistent in-memory cache**: Vercel serverless functions are stateless — the `Map` cache in `server.js` resets on every cold invocation. Lookups still work; they just re-fetch every time.
- **60s function timeout**: Vercel's free tier allows up to 60 seconds per function invocation. Large IP lists (40+ IPs) with WHOIS can approach this. Stay under ~30 IPs per lookup to be safe.
- **WHOIS port 43**: Vercel runs on AWS Lambda which does not block outbound port 43. WHOIS lookups will work, though they may time out more often than locally.
- **ip-api.com rate limits**: The server IP is shared with other Vercel users' functions — the ipwho.is fallback handles rate-limit failures gracefully.
