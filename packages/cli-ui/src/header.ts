import { theme } from './theme.js';

/**
 * Bold section heading, used in --help and other structured surfaces.
 *
 *   USAGE
 *
 * No color decoration on the heading itself — bold is enough.
 */
export function header(title: string): string {
  return theme.b(title.toUpperCase());
}
