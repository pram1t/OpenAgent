import { theme } from './theme.js';
import { term } from './term.js';

/**
 * Horizontal mustard rule — used between sections.
 *
 *   ─────────────────────────────────────
 *
 * Defaults to terminal width minus 4. Pass an explicit width to lock.
 */
export function divider(width?: number): string {
  const w = width ?? Math.max(20, term.width - 4);
  const ch = term.unicode ? '─' : '-';
  return theme.muted(ch.repeat(w));
}
