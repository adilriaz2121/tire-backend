const FEDEX_API_KEY = process.env.FEDEX_API_KEY || '';
const FEDEX_API_SECRET = process.env.FEDEX_API_SECRET || '';
const FEDEX_BASE_URL = process.env.FEDEX_BASE_URL || 'https://apis-sandbox.fedex.com';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getFedExToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${FEDEX_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: FEDEX_API_KEY,
      client_secret: FEDEX_API_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FedEx auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

export async function validateAddress({ streetLines, city, state, zip, country = 'US' }) {
  const token = await getFedExToken();

  const res = await fetch(`${FEDEX_BASE_URL}/address/v1/addresses/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      addressesToValidate: [
        {
          address: {
            streetLines: Array.isArray(streetLines) ? streetLines : [streetLines],
            city,
            stateOrProvinceCode: state,
            postalCode: zip,
            countryCode: country,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FedEx address validation failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const result = data?.output?.resolvedAddresses?.[0];

  if (!result) {
    return { valid: false, reasons: ['Address not found.'], message: 'Address could not be validated.' };
  }

  const classification = result.classification;
  const attributes = result.attributes || {};

  const isResolved = classification === 'RESOLVED';
  const isMixed = classification === 'MIXED';

  const suggested = {
    streetLines: result.streetLinesToken || streetLines,
    city: result.city || city,
    state: result.stateOrProvinceCode || state,
    zip: result.postalCode || zip,
    country: result.countryCode || country,
  };

  // Build specific reasons from FedEx attributes
  const reasons = [];

  if (attributes.InvalidSuiteNumber === true) {
    reasons.push('The apartment/suite number is invalid.');
  }
  if (attributes.SuiteRequiredButMissing === true) {
    reasons.push('An apartment/suite number is required but missing.');
  }
  if (attributes.DPV === false || attributes.DPV === 'N') {
    reasons.push('The street address could not be confirmed for delivery.');
  }
  if (attributes.Matched === false) {
    reasons.push('The address does not match any known location.');
  }
  if (attributes.POBox === true) {
    reasons.push('PO Box addresses are not supported for shipping.');
  }

  // Check for city/state/zip mismatches
  if (result.city && city && result.city.toUpperCase() !== city.toUpperCase()) {
    reasons.push(`City does not match — did you mean "${result.city}"?`);
  }
  if (result.stateOrProvinceCode && state && result.stateOrProvinceCode.toUpperCase() !== state.toUpperCase()) {
    reasons.push(`State does not match — expected "${result.stateOrProvinceCode}".`);
  }
  if (result.postalCode && zip && !result.postalCode.startsWith(zip.replace(/-.*/, ''))) {
    reasons.push(`ZIP code does not match this address — suggested "${result.postalCode}".`);
  }

  if (isResolved) {
    return {
      valid: true,
      classification,
      suggested,
      reasons,
      message: 'Address validated successfully.',
    };
  }

  if (isMixed) {
    return {
      valid: true,
      classification,
      suggested,
      reasons: reasons.length ? reasons : ['Address partially matched. Please verify the suggested address.'],
      message: reasons.length
        ? reasons.join(' ')
        : 'Address partially matched. Please verify the suggested address.',
    };
  }

  // UNKNOWN or unresolved
  if (reasons.length === 0) {
    reasons.push('The address could not be verified. Please check street, city, state, and ZIP code.');
  }

  return {
    valid: false,
    classification,
    suggested,
    reasons,
    message: reasons.join(' '),
  };
}
