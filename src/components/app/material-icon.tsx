import { cn } from "@/lib/utils";

/**
 * ICON REGISTRY — materials
 * ----------------------------------------------------------------------------
 * The illustrated material icons, bound to the stock item each one depicts.
 *
 * Keyed by material code rather than by name: the code is the stable
 * identifier in the data, and two items can share a display name across
 * warehouses while a name is also the thing most likely to be reworded.
 *
 * Several materials deliberately share a glyph — every free-flowing white
 * powder is the same bowl, both polymer feedstocks are the same pellets. The
 * icon is a category cue that helps the eye group a long table, not a unique
 * portrait of each SKU, and inventing sixteen distinguishable renders would
 * make the column louder without making it more informative.
 */
const MATERIAL_ICONS: Record<string, string> = {
  "RM-1042": "polymer-pellets",   // Polypropylene granules
  "RM-2087": "amber-flask",       // Stearic acid
  "RM-3011": "polymer-pellets",   // HDPE resin
  "RM-4023": "powder-bowl",       // Sodium lauryl sulphate
  "RM-5018": "powder-bowl",       // EDTA disodium salt
  "RM-6031": "powder-bowl",       // Titanium dioxide
  "RM-7044": "water-droplet",     // Demineralised water
  "RM-8012": "perfume-bottle",    // Fragrance blend FG-04
  "RM-9055": "powder-bowl",       // Caustic soda flakes
  "RM-1066": "powder-bowl",       // Citric acid monohydrate
  "RM-1177": "clear-bottle",      // Isopropyl alcohol
  "PM-1001": "clear-bottle",      // HDPE bottle 5L
  "PM-1002": "label-plate",       // Shrink labels (Type A)
  "PM-2003": "foil-roll",         // Foil seals 5L
  "RM-2101": "amber-flask",       // Coconut diethanolamide
  "RM-2205": "amber-flask",       // Glycerine IP

  /*
    Not in the supplied mapping. Carried on the nearest glyph in the same set
    so the column has no gaps: a bleach solution and an essential oil are a
    bottled liquid and an amber liquid, and the remaining two packaging items
    already have their exact pictures here.
  */
  "RM-3310": "clear-bottle",      // Sodium hypochlorite
  "RM-4401": "amber-flask",       // Pine oil
  "PM-3004": "corrugated-sheet",  // Corrugated cartons (5Lx6)
  "PM-2008": "label-plate",       // Shrink labels (Type B)
};

/**
 * The material glyph that sits before a name in a stock table.
 *
 * Sized at 20px in a fixed square with `object-contain`: the source renders
 * are all different shapes, and fitting them to a common box is what keeps a
 * tall bottle and a wide stack of sheets on the same optical line down the
 * column. Renders nothing for a material with no icon, so an unmapped row
 * loses the glyph rather than the layout.
 *
 * Decorative — the name it precedes is right there, so it is hidden from
 * assistive technology rather than repeating it.
 */
export function MaterialIcon({ code, className }: { code: string; className?: string }) {
  const icon = MATERIAL_ICONS[code];
  if (!icon) return null;

  return (
    <img
      src={`/icons/materials/${icon}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("block h-5 w-5 shrink-0 object-contain", className)}
    />
  );
}
