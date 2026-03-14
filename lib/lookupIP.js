const axios = require('axios');

const IP_API_FIELDS = 'status,message,country,regionName,city,org,as,asname,mobile,proxy,hosting,query';
const WHOIS_TIMEOUT = 5000;

async function whoisLookup(ip) {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve(null), WHOIS_TIMEOUT);
    try {
      const { default: whois } = await import('whois');
      whois.lookup(ip, (err, data) => {
        clearTimeout(timer);
        resolve(err ? null : data);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function lookupViaIpApi(ip) {
  const res = await axios.get(`http://ip-api.com/json/${ip}`, {
    params: { fields: IP_API_FIELDS },
    timeout: 8000,
  });
  if (res.data.status === 'fail') throw new Error(res.data.message || 'ip-api lookup failed');
  return res.data;
}

async function lookupViaIpWhoIs(ip) {
  const res = await axios.get(`https://ipwho.is/${ip}`, { timeout: 8000 });
  if (!res.data.success) throw new Error(res.data.message || 'ipwho.is lookup failed');
  // Normalize to ip-api shape
  return {
    query: ip,
    country: res.data.country,
    regionName: res.data.region,
    city: res.data.city,
    org: res.data.connection?.isp || '',
    as: res.data.connection?.asn ? `AS${res.data.connection.asn} ${res.data.connection.org || ''}` : '',
    asname: res.data.connection?.org || '',
    mobile: false,
    proxy: res.data.security?.proxy || false,
    hosting: res.data.type === 'hosting',
  };
}

async function lookupIP(ip) {
  const [geoResult, whoisResult] = await Promise.allSettled([
    (async () => {
      try {
        return await lookupViaIpApi(ip);
      } catch {
        return await lookupViaIpWhoIs(ip);
      }
    })(),
    whoisLookup(ip),
  ]);

  return {
    geo: geoResult.status === 'fulfilled' ? geoResult.value : null,
    geoError: geoResult.status === 'rejected' ? geoResult.reason?.message : null,
    whoisRaw: whoisResult.status === 'fulfilled' ? whoisResult.value : null,
  };
}

module.exports = { lookupIP };
