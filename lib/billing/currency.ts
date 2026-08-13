/**
 * lib/billing/currency.ts
 *
 * Decides which currency a customer is billed in.
 *
 * WHY THIS IS SERVER-SIDE AND STICKY
 *
 * Razorpay plan amount and currency are immutable, and a subscription's
 * currency cannot be changed after creation. So the choice is made once, on
 * the server, at subscription-creation time, and then stored on the
 * subscription row. It is never re-derived afterwards: a customer who
 * subscribes in India and later travels must keep being charged in INR, or
 * their mandate breaks.
 *
 * PAYMENT METHOD ASYMMETRY (from Razorpay account settings)
 *
 *   INR  cards + UPI Autopay + eMandate
 *   USD  cards only
 *
 * This matters because Indian card recurring is heavily restricted by RBI
 * rules (limited card support, ₹15,000 threshold requiring additional
 * authentication). UPI Autopay is the path most Indian customers will
 * actually complete, and it only exists for INR. Billing an Indian customer
 * in USD would technically work but would cut them off from the payment
 * method most likely to succeed.
 */

export type BillingCurrency = 'INR' | 'USD';

/**
 * Countries billed in INR. Only India: Razorpay's UPI and eMandate rails are
 * domestic, and no other market gains anything from INR pricing.
 */
const INR_COUNTRIES = new Set(['IN']);

/**
 * Reads the visitor's country from platform-provided geo headers.
 *
 * These headers are set by the edge/CDN layer and cannot be spoofed by the
 * browser in the way a normal request header can — the platform overwrites
 * whatever the client sends. Order reflects deployment preference.
 *
 * Returns null when no platform header is present (local development, or a
 * host that does not inject geo data).
 */
export function countryFromHeaders(headers: Headers): string | null {
  const candidates = [
    'x-vercel-ip-country',   // Vercel
    'cf-ipcountry',          // Cloudflare
    'x-country-code',        // some proxies
    'x-appengine-country',   // Google Cloud
  ];

  for (const header of candidates) {
    const value = headers.get(header);
    if (value && value.length === 2 && value !== 'XX') {
      return value.toUpperCase();
    }
  }

  return null;
}

/**
 * Resolves billing currency for a new subscription.
 *
 * Unknown geography defaults to USD rather than INR. The reasoning: a
 * customer wrongly billed USD can still pay with an Indian card (proven on
 * this account), whereas a customer wrongly billed INR who is outside India
 * may be unable to pay at all. The failure mode of the default should be
 * "slightly wrong price" and not "cannot subscribe".
 */
export function resolveBillingCurrency(headers: Headers): BillingCurrency {
  const country = countryFromHeaders(headers);
  if (country && INR_COUNTRIES.has(country)) return 'INR';
  return 'USD';
}

/**
 * Allows an explicit client preference, but only within what geography
 * permits. A customer detected in India may deliberately choose USD (some
 * prefer a card they hold abroad); a customer outside India cannot select INR,
 * because UPI and eMandate are unavailable to them and an INR card mandate
 * would be rejected at authorization.
 */
export function reconcileCurrencyPreference(
  detected: BillingCurrency,
  requested: unknown
): BillingCurrency {
  if (requested !== 'INR' && requested !== 'USD') return detected;
  if (requested === 'INR' && detected !== 'INR') return detected;
  return requested;
}

/** Payment methods available for a currency, for display on the checkout UI. */
export function availableMethods(currency: BillingCurrency): string[] {
  return currency === 'INR'
    ? ['Card', 'UPI Autopay', 'Net Banking (eMandate)']
    : ['Card'];
}

export function formatMinor(amountMinor: number, currency: BillingCurrency): string {
  const major = amountMinor / 100;
  return currency === 'INR'
    ? `₹${major.toLocaleString('en-IN')}`
    : `$${major.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}