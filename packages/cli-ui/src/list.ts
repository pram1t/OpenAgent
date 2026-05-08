import { theme } from './theme.js';
import { term } from './term.js';

const BULLET = () => (term.unicode ? '•' : '*');

/**
 * Muted bullet list.
 *
 *   • first item
 *   • second item
 */
export function list(items: string[], opts: { indent?: number } = {}): string {
  const indent = ' '.repeat(opts.indent ?? 2);
  return items.map((item) => `${indent}${theme.muted(BULLET())}  ${item}`).join('\n');
}
