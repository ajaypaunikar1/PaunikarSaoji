/**
 * Centralized Indian-currency display formatting.
 *
 * Presentation only: values stored in the database and used in calculations
 * keep full float precision; this helper is applied exclusively at render time
 * so receipts, dashboards and tables always show clean amounts like
 * ₹24,226.80 instead of floating-point artifacts (24226.800000000004).
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** Formats a numeric value as ₹ with en-IN grouping and exactly 2 decimals. */
export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${inrFormatter.format(n)}`;
}

/** Same grouping/decimals as formatCurrency but without the ₹ symbol. */
export function formatAmount(value: number | string | null | undefined): string {
  return formatCurrency(value).slice(1);
}
