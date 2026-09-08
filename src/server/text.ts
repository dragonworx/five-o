// Small text helpers for name recovery.

// Levenshtein edit distance with an early-exit ceiling — we only care whether it
// is ≤ 2, so we bail out as soon as every cell in a row exceeds the ceiling.
export function levenshtein(a: string, b: string, ceiling = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      const value = Math.min(del, ins, sub);
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > ceiling) return ceiling + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}
