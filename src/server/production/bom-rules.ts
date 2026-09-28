/**
 * BOM write rules, free of the database.
 *
 * A BOM version is immutable once created — work orders pin the version
 * they consumed, and changing it underneath them would rewrite history.
 * Engineering changes are a new version, activated when ready; activation
 * retires the previous active version.
 */

/**
 * Would activating `components` as the recipe of `parent` create a cycle?
 *
 * `graph` maps each material to the components of its currently active BOM
 * version. The candidate replaces the parent's own entry. Returns the path
 * of material ids from the parent back to itself, or null if the structure
 * stays acyclic. Depth-first with a visited set, so shared sub-assemblies
 * are walked once.
 */
export function findCycle(parent: string, components: string[], graph: Map<string, string[]>): string[] | null {
  const edges = new Map(graph);
  edges.set(parent, components);
  const done = new Set<string>();

  function walk(node: string, path: string[]): string[] | null {
    for (const next of edges.get(node) ?? []) {
      if (next === parent) return [...path, next];
      if (done.has(next) || path.includes(next)) continue;
      const found = walk(next, [...path, next]);
      if (found) return found;
    }
    done.add(node);
    return null;
  }

  return walk(parent, [parent]);
}
