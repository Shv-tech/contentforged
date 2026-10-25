/**
 * lib/forge/prediction-format.ts
 *
 * How a prediction reads, shared by the server (emails, the API) and the
 * browser (draft cards, the studio). Pure, so client code can import it.
 */

export interface RangeLike {
  low: number;
  high: number;
  expected: number;
}

function times(value: number): string {
  return value >= 10 ? `${Math.round(value)}x` : `${value.toFixed(1)}x`;
}

/** "1.2x to 1.8x your usual", or "about your usual". */
export function describeRange(prediction: RangeLike): string {
  if (prediction.low >= 0.9 && prediction.high <= 1.1) return 'about your usual';
  return `${times(prediction.low)} to ${times(prediction.high)} your usual`;
}

/** good when the likely result beats the author's usual, warn when it trails it. */
export function rangeTone(prediction: RangeLike): 'good' | 'warn' | 'neutral' {
  if (prediction.expected >= 1.15) return 'good';
  if (prediction.expected <= 0.85) return 'warn';
  return 'neutral';
}

/** "Right 7 of the last 10 times", or null until there are enough to say. */
export function describeHitRate(rate: { evaluated: number; landed: number; rate: number | null }): string | null {
  if (rate.rate === null) return null;
  return `Forge's ranges were right ${rate.landed} of the last ${rate.evaluated} times`;
}
