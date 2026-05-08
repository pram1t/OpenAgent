/**
 * Mustard-themed progress bar.
 *
 *   sowing intent  ▰▰▰▰▰▱▱▱▱▱   50%   5/10
 *
 * Wraps cli-progress with the locked theme and Braille-block fill.
 */

import cliProgress from 'cli-progress';
import { theme } from './theme.js';
import { term } from './term.js';

export interface ProgressOptions {
  total: number;
  format?: string;
  /** What to show in the bar fill. Default '▰' (block-1, theme.accent). */
  completeChar?: string;
  /** What to show in the bar void. Default '▱'. */
  incompleteChar?: string;
}

export function progress(opts: ProgressOptions) {
  const ch = term.unicode
    ? { complete: opts.completeChar ?? '▰', incomplete: opts.incompleteChar ?? '▱' }
    : { complete: opts.completeChar ?? '#', incomplete: opts.incompleteChar ?? '-' };

  const fmt =
    opts.format ??
    `${theme.brand('{bar}')}  ${theme.b('{percentage}%')}  ${theme.muted('{value}/{total}')}`;

  return new cliProgress.SingleBar({
    format: fmt,
    barCompleteChar: ch.complete,
    barIncompleteChar: ch.incomplete,
    hideCursor: true,
    barsize: 20,
  });
}
