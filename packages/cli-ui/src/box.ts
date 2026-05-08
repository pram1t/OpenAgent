/**
 * Rounded mustard-bordered box. Wraps `boxen` with the locked theme.
 *
 * Identity surfaces only: boot success, field-create success, tail
 * header, error frames. Never use for tables or wrapping help body.
 */

import boxen, { type Options as BoxenOptions } from 'boxen';
import { theme } from './theme.js';

export interface BoxOptions {
  title?: string;
  /** Default 'round' borders. Pass 'classic' for ASCII fallback context. */
  borderStyle?: 'round' | 'classic';
  /** Inner horizontal padding (default 2). */
  padding?: number;
  /** Total max width (default: terminal width minus 4). */
  width?: number;
  /** Border color role — defaults to brand. */
  borderRole?: 'brand' | 'muted' | 'error' | 'warn';
}

export function box(content: string, opts: BoxOptions = {}): string {
  const role = opts.borderRole ?? 'brand';
  const colorize = theme[role];

  const boxenOpts: BoxenOptions = {
    borderStyle: opts.borderStyle ?? 'round',
    padding: { top: 1, right: opts.padding ?? 2, bottom: 1, left: opts.padding ?? 2 },
    margin: 0,
    ...(opts.title ? { title: colorize(opts.title) } : {}),
    ...(opts.width ? { width: opts.width } : {}),
  };

  // boxen's `borderColor` only accepts named ANSI colors; we need true
  // mustard, so we render with no border color from boxen and re-color
  // border characters in a post-pass.
  const raw = boxen(content, boxenOpts);
  return raw
    .split('\n')
    .map((line) => recolorBorders(line, colorize))
    .join('\n');
}

function recolorBorders(line: string, colorize: (s: string) => string): string {
  // Match runs of box-drawing characters and color them.
  return line.replace(/[╭╮╰╯─│┌┐└┘╔╗╚╝═║]+/g, (m) => colorize(m));
}
