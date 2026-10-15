/**
 * Derives a visually "stronger" (darkened) variant of a widget's configured primary color,
 * for the `--eversoft-brand-strong` CSS variable used as the hover/active state everywhere
 * `hover:bg-brand-strong` already appears (Phase 3's calculators, unmodified). Widgets only
 * configure a single `primaryColor` (docs/06 §2: "kept minimal"), so this avoids asking an
 * agent to pick a second color just for hover states.
 */
export function darkenHexColor(hex: string, amount = 0.18): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const value = match[1] ?? '';
  const channel = (offset: number): number => {
    const raw = parseInt(value.slice(offset, offset + 2), 16);
    return Math.max(0, Math.round(raw * (1 - amount)));
  };
  const toHex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${toHex(channel(0))}${toHex(channel(2))}${toHex(channel(4))}`;
}

/** The two CSS custom properties `tailwind.config.js`'s `brand` color reads from. */
export function brandCssVariables(primaryColor: string): Record<string, string> {
  return {
    '--eversoft-brand': primaryColor,
    '--eversoft-brand-strong': darkenHexColor(primaryColor),
  };
}
