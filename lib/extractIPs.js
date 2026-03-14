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

function extractIPs(text, { includePrivate = false } = {}) {
  const found = new Set();
  for (const m of text.matchAll(IPV4_RE)) if (includePrivate || !isPrivate(m[1])) found.add(m[1]);
  for (const m of text.matchAll(IPV6_RE)) if (includePrivate || !isPrivate(m[0])) found.add(m[0]);
  return Array.from(found);
}

module.exports = { extractIPs, isPrivate };
