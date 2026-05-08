/**
 * Aligned key-value renderer.
 *
 *   kv({ id: '6f2a…', mode: 'plan', link: 'mustard.dev/...' })
 *   → "   id    6f2a…
 *       mode  plan
 *       link  mustard.dev/..."
 *
 * Keys are dimmed by default; values render plain. Padding aligns to
 * the longest key. Used inside success boxes and `field get` output.
 */

import { theme } from './theme.js';

export interface KvOptions {
  /** Indent each line by N spaces (default 0). */
  indent?: number;
  /** Spaces between key and value (default 2). */
  gap?: number;
  /** Dim the keys (default true). */
  dimKeys?: boolean;
}

export function kv(
  pairs: Record<string, string | number | undefined>,
  opts: KvOptions = {},
): string {
  const indent = ' '.repeat(opts.indent ?? 0);
  const gap = ' '.repeat(opts.gap ?? 2);
  const dimKeys = opts.dimKeys ?? true;

  const entries = Object.entries(pairs).filter(
    ([, v]) => v !== undefined && v !== null,
  ) as [string, string | number][];

  if (entries.length === 0) return '';

  const maxKey = Math.max(...entries.map(([k]) => k.length));

  return entries
    .map(([k, v]) => {
      const paddedKey = k.padEnd(maxKey, ' ');
      const keyStr = dimKeys ? theme.muted(paddedKey) : paddedKey;
      return `${indent}${keyStr}${gap}${v}`;
    })
    .join('\n');
}
