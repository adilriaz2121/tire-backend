const FEDEX_API_KEY = process.env.FEDEX_API_KEY || '';
const FEDEX_API_SECRET = process.env.FEDEX_API_SECRET || '';
const FEDEX_ACCOUNT_NUMBER = process.env.FEDEX_ACCOUNT_NUMBER || '';
const FEDEX_BASE_URL = process.env.FEDEX_BASE_URL || 'https://apis-sandbox.fedex.com';

const WAREHOUSE_ADDRESS = {
  streetLines: ['301 S Millers Ferry Rd'],
  city: 'Wilmer',
  stateOrProvinceCode: 'TX',
  postalCode: '75172',
  countryCode: 'US',
};

const SHIPPER_CONTACT = {
  personName: 'The Tire Deal',
  phoneNumber: '0000000000',
  companyName: 'The Tire Deal',
};

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

  // If FedEx resolved to a different country, ignore its suggestion and treat as valid US address
  if (result.countryCode && country && result.countryCode.toUpperCase() !== country.toUpperCase()) {
    return {
      valid: true,
      classification: 'RESOLVED',
      suggested: { streetLines: Array.isArray(streetLines) ? streetLines : [streetLines], city, state, zip, country },
      reasons: [],
      message: 'Address accepted.',
    };
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

/**
 * Create a FedEx shipment and return tracking number.
 * @param {Object} recipient - { personName, phoneNumber, streetLines, city, state, zip, country }
 * @param {number} totalWeight - Total package weight in LBS
 * @returns {{ trackingNumber: string, shipDatestamp: string }}
 */
export async function createShipment({ recipient, totalWeight }) {
  const token = await getFedExToken();

  const shipmentPayload = {
    labelResponseOptions: 'URL_ONLY',
    accountNumber: { value: FEDEX_ACCOUNT_NUMBER },
    requestedShipment: {
      shipper: {
        contact: SHIPPER_CONTACT,
        address: WAREHOUSE_ADDRESS,
      },
      recipients: [
        {
          contact: {
            personName: recipient.personName,
            phoneNumber: recipient.phoneNumber || '0000000000',
          },
          address: {
            streetLines: Array.isArray(recipient.streetLines)
              ? recipient.streetLines
              : [recipient.streetLines],
            city: recipient.city,
            stateOrProvinceCode: recipient.state,
            postalCode: recipient.zip,
            countryCode: recipient.country || 'US',
          },
        },
      ],
      pickupType: 'USE_SCHEDULED_PICKUP',
      serviceType: 'FEDEX_GROUND',
      packagingType: 'YOUR_PACKAGING',
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: {
          responsibleParty: {
            accountNumber: { value: FEDEX_ACCOUNT_NUMBER },
          },
        },
      },
      labelSpecification: {
        labelFormatType: 'COMMON2D',
        imageType: 'PDF',
        labelStockType: 'PAPER_LETTER',
      },
      requestedPackageLineItems: [
        {
          weight: {
            units: 'LB',
            value: totalWeight,
          },
          dimensions: {
            length: 30,
            width: 30,
            height: 15,
            units: 'IN',
          },
        },
      ],
    },
  };

  const res = await fetch(`${FEDEX_BASE_URL}/ship/v1/shipments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(shipmentPayload),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = 'FedEx shipment creation failed';
    try {
      const errorData = JSON.parse(text);
      if (errorData.errors && errorData.errors.length > 0) {
        message = errorData.errors.map(e => e.message).join('. ');
      }
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const piece = data?.output?.transactionShipments?.[0]?.pieceResponses?.[0];
  const trackingNumber = piece?.trackingNumber
    || data?.output?.transactionShipments?.[0]?.masterTrackingNumber?.trackingNumber;

  if (!trackingNumber) {
    throw new Error('FedEx shipment created but no tracking number returned');
  }

  return {
    trackingNumber,
    shipDatestamp: data?.output?.transactionShipments?.[0]?.shipDatestamp || new Date().toISOString(),
  };
}
