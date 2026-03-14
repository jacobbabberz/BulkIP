function parseAsn(asString) {
  // asString looks like "AS15169 Google LLC"
  if (!asString) return { number: null, organization: null };
  const match = asString.match(/^AS(\d+)\s*(.*)/);
  if (!match) return { number: null, organization: asString };
  return { number: parseInt(match[1], 10), organization: match[2] || null };
}

function deriveInfrastructure(geo) {
  if (!geo) return null;
  if (geo.hosting) return 'DATACENTER';
  if (geo.proxy) return 'ANONYMOUS_PROXY';
  if (geo.mobile) return 'MOBILE';
  return 'RESIDENTIAL';
}

function normalizeResult(ip, { geo, geoError, whoisRaw }) {
  if (!geo) {
    return {
      ip,
      error: geoError || 'Lookup failed',
      as: null,
      organization: null,
      infrastructure: null,
      location: null,
      whois_raw: whoisRaw || null,
    };
  }

  const asn = parseAsn(geo.as);

  return {
    ip,
    as: {
      number: asn.number,
      organization: asn.organization || geo.asname || null,
    },
    organization: geo.org || asn.organization || null,
    infrastructure: deriveInfrastructure(geo),
    location: {
      city: geo.city || null,
      state: geo.regionName || null,
      country: geo.country || null,
    },
    whois_raw: whoisRaw || null,
  };
}

module.exports = { normalizeResult };
