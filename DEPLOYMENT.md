# Deployment Plan — Vercel (Free)

Vercel serves `public/` as a static CDN automatically. The Express backend is wrapped as a single serverless function.

---

## Code Changes Required

### 1. Update `server.js`

Guard the `app.listen` call so it only runs locally, and export the app for Vercel:

```js
// Replace app.listen(...) at the bottom of server.js with:
if (require.main === module) {
  app.listen(PORT, () => console.log(`BulkIP running at http://localhost:${PORT}`));
}
module.exports = app;
```

Remove the static file middleware — Vercel serves `public/` natively:
```js
// Remove this line:
app.use(express.static(path.join(__dirname, 'public')));
```

### 2. Create `api/index.js`

Vercel treats any file in `api/` as a serverless function entry point:

```js
module.exports = require('../server');
```

### 3. Add `vercel.json`

Routes `/api/*` to the serverless function; everything else is served from `public/`:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

---

## Updated File Structure

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

---

## Deployment Steps

### Step 1 — Initialize git repo

```bash
echo "node_modules/\n*.log" > .gitignore

git init
git add .
git commit -m "Initial commit"
```

### Step 2 — Push to GitHub

Create a new empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/BulkIP.git
git branch -M main
git push -u origin main
```

### Step 3 — Deploy on Vercel

1. Sign up at **vercel.com** with your GitHub account (no credit card required)
2. Click **Add New > Project**, import the `BulkIP` repo
3. Leave all settings as defaults — Vercel auto-detects Node.js
4. Click **Deploy** — live in ~1 minute at `https://bulkip.vercel.app`

Every subsequent `git push` to `main` auto-deploys.

---

## Gotchas

- **No persistent cache**: Vercel functions are stateless — the in-memory cache resets on every cold invocation. Lookups still work; they just re-fetch every time.
- **60s function timeout**: Large IP lists with WHOIS can approach this. Stay under ~30 IPs per lookup to be safe on the free tier.
- **WHOIS port 43**: Vercel runs on AWS Lambda which does not block outbound port 43 — WHOIS lookups will work.
- **ip-api.com rate limits**: The server IP is shared across Vercel's infrastructure. The ipwho.is fallback handles rate-limit failures gracefully.
