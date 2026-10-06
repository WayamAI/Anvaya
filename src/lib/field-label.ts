/**
 * A field-level problem from the API, as a person reads it.
 *
 * The server names each problem by its body path ("lines.4.quantity",
 * "requiredDate"). A message that is already a sentence ("Not enough
 * released RM-8012 for 40.4…") names what it is about and stands alone; a
 * fragment ("cannot be before the order date") gets a readable field name in
 * front — "Line 5 quantity", "Required date" — never the raw path.
 */
export function describeProblem(d: { path: string; message: string }): string {
  if (/^[A-Z0-9]/.test(d.message) || !d.path) return d.message;
  return `${fieldLabel(d.path)}: ${d.message}`;
}

export function fieldLabel(path: string): string {
  const words: string[] = [];
  for (const seg of path.split(".")) {
    if (/^\d+$/.test(seg)) {
      // "lines.4" → "line 5": positions are 1-based for people.
      if (words.length) words[words.length - 1] = words[words.length - 1].replace(/s$/, "");
      words.push(String(Number(seg) + 1));
    } else {
      words.push(seg.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Qty\b/i, "quantity").replace(/Ids?\b/, "").toLowerCase().trim());
    }
  }
  const label = words.filter(Boolean).join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
