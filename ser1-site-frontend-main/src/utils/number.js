// src/utils/number.js
export function toNumber(val, fallback = 0) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (val === null || val === undefined) return fallback;
  // remplace la virgule par un point et enlève les espaces
  const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}
