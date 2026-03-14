// IPv4 and IPv6 extraction (mirrors server-side lib/extractIPs.js)
const IPV4_RE = /\b((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))\b/g;
// Alternatives ordered longest-match first so greedy alternation doesn't cut short
const IPV6_RE = /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1?\d)?\d)\.){3}(?:25[0-5]|(?:2[0-4]|1?\d)?\d)|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?\d)?\d)\.){3}(?:25[0-5]|(?:2[0-4]|1?\d)?\d)|(?:[0-9a-fA-F]{1,4}:){1,7}:|::/g;

const PRIVATE_IPV4 = [/^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^127\./, /^169\.254\./, /^0\.0\.0\.0$/];
const PRIVATE_IPV6 = [/^::1$/, /^fe80:/i, /^fc/i, /^fd/i];

function isPrivate(ip) {
  return ip.includes(':')
    ? PRIVATE_IPV6.some(r => r.test(ip))
    : PRIVATE_IPV4.some(r => r.test(ip));
}

function extractIPs(text) {
  const found = new Set();
  for (const m of text.matchAll(IPV4_RE)) if (!isPrivate(m[1])) found.add(m[1]);
  for (const m of text.matchAll(IPV6_RE)) if (!isPrivate(m[0])) found.add(m[0]);
  return Array.from(found);
}

// DOM refs
const logInput     = document.getElementById('log-input');
const ipCounter    = document.getElementById('ip-counter');
const lookupBtn    = document.getElementById('lookup-btn');
const clearBtn     = document.getElementById('clear-btn');
const loading      = document.getElementById('loading');
const loadingText  = document.getElementById('loading-text');
const resultsSection = document.getElementById('results-section');
const resultsCount = document.getElementById('results-count');
const resultsGrid  = document.getElementById('results-grid');
const copyJsonBtn  = document.getElementById('copy-json-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');

let currentResults = [];
let debounceTimer = null;

logInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateCounter, 300);
});

function updateCounter() {
  const ips = extractIPs(logInput.value);
  if (ips.length === 0) {
    ipCounter.textContent = '';
    ipCounter.classList.remove('has-ips');
    lookupBtn.disabled = true;
  } else {
    ipCounter.textContent = `${ips.length} IP${ips.length !== 1 ? 's' : ''} detected`;
    ipCounter.classList.add('has-ips');
    lookupBtn.disabled = false;
  }
}

clearBtn.addEventListener('click', () => {
  logInput.value = '';
  updateCounter();
  resultsSection.classList.add('hidden');
  currentResults = [];
});

lookupBtn.addEventListener('click', handleSubmit);

async function handleSubmit() {
  const ips = extractIPs(logInput.value);
  if (ips.length === 0) return;

  setLoading(true, `Looking up ${ips.length} IP${ips.length !== 1 ? 's' : ''}...`);
  resultsSection.classList.add('hidden');

  try {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    currentResults = data.results;
    renderResults(currentResults);
  } catch (err) {
    alert(`Lookup failed: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

function setLoading(on, text = '') {
  loading.classList.toggle('hidden', !on);
  loadingText.textContent = text;
  lookupBtn.disabled = on;
}

function renderResults(results) {
  resultsGrid.innerHTML = '';
  resultsCount.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;

  for (const r of results) {
    resultsGrid.appendChild(buildCard(r));
  }

  resultsSection.classList.remove('hidden');
}

function buildCard(r) {
  const card = document.createElement('div');
  card.className = 'ip-card' + (r.error ? ' error' : '');

  const infra = r.infrastructure || (r.error ? 'error' : null);
  const badgeLabel = infra ? infra.replace('_', ' ') : 'UNKNOWN';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-ip">${esc(r.ip)}</span>
      <span class="badge badge-${infra || 'error'}">${esc(badgeLabel)}</span>
    </div>
    <div class="card-fields">
      ${r.error ? `<div class="card-field"><span class="field-label">error</span><span class="field-value">${esc(r.error)}</span></div>` : `
      ${field('org', r.organization)}
      ${field('asn', r.as ? `AS${r.as.number} — ${r.as.organization}` : null)}
      ${field('location', r.location ? [r.location.city, r.location.state, r.location.country].filter(Boolean).join(', ') : null)}
      `}
    </div>
    ${r.whois_raw ? `
    <details>
      <summary>Raw WHOIS</summary>
      <pre class="whois-raw">${esc(r.whois_raw)}</pre>
    </details>` : ''}
  `;

  return card;
}

function field(label, value) {
  const isNull = value == null || value === '';
  return `<div class="card-field">
    <span class="field-label">${label}</span>
    <span class="field-value${isNull ? ' null-val' : ''}">${isNull ? 'N/A' : esc(String(value))}</span>
  </div>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

copyJsonBtn.addEventListener('click', () => {
  const json = JSON.stringify(currentResults.map(r => {
    const { whois_raw, ...rest } = r;
    return rest;
  }), null, 2);
  navigator.clipboard.writeText(json).then(() => flashBtn(copyJsonBtn, 'Copied!'));
});

exportCsvBtn.addEventListener('click', () => {
  const headers = ['ip', 'organization', 'asn_number', 'asn_org', 'infrastructure', 'city', 'state', 'country', 'error'];
  const rows = currentResults.map(r => [
    r.ip,
    r.organization || '',
    r.as?.number || '',
    r.as?.organization || '',
    r.infrastructure || '',
    r.location?.city || '',
    r.location?.state || '',
    r.location?.country || '',
    r.error || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulkip-results.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function flashBtn(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 1500);
}
