const formatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 2,
  roundingMode: 'halfCeil',
});

export function roundMoney(amount) {
  return typeof amount === 'number' && !Number.isFinite(amount) ? amount : Number(formatter.format(amount));
}
