/** An analytic as it is read: its text when that already carries the label (as planned), else "label — text". */
export function analyticLine(label: string, text: string): string {
  const t = text.trim();
  const l = label.trim();
  if (!t) return l;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !l || norm(t.slice(0, l.length + 12)).includes(norm(l)) ? t : `${l} — ${t}`;
}
