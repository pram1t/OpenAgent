/**
 * Mustard banner — composer with mascot + wordmark + tagline + hints.
 *
 * Sizes:
 *   full     — bot mascot + ANSI Shadow wordmark + tagline + hint lines
 *   mid      — wordmark only + tagline (used for `--version`)
 *   inline   — single line for narrow terminals
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { theme } from './theme.js';
import { term } from './term.js';

const ASSETS_DIR = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, 'assets');
  } catch {
    return join(__dirname, 'assets');
  }
})();

function loadAsset(file: string, cache: { v: string | null }): string {
  if (cache.v !== null) return cache.v;
  try {
    cache.v = readFileSync(join(ASSETS_DIR, file), 'utf8');
  } catch {
    cache.v = '';
  }
  return cache.v;
}

const botFullCache = { v: null as string | null };
const wmFullCache = { v: null as string | null };
const wmMidCache = { v: null as string | null };

export type BannerSize = 'full' | 'mid' | 'inline' | 'auto';

export interface BannerOptions {
  size?: BannerSize;
  version?: string;
  tagline?: string;
  hints?: Array<{ cmd: string; desc: string }>;
}

const DEFAULT_TAGLINE = 'multiplayer code';
const DEFAULT_HINTS: Array<{ cmd: string; desc: string }> = [
  { cmd: 'mustard login', desc: 'get started' },
  { cmd: 'mustard --help', desc: 'all commands' },
];

export function banner(opts: BannerOptions = {}): string {
  const tagline = opts.tagline ?? DEFAULT_TAGLINE;
  const versionStr = opts.version ? ` v${opts.version}` : '';
  const hints = opts.hints ?? DEFAULT_HINTS;

  let size = opts.size ?? 'auto';
  if (size === 'auto') {
    if (term.width < 60 || !term.isTTY) size = 'inline';
    else if (term.width < 100) size = 'mid';
    else size = 'full';
  }

  if (size === 'inline') return inlineBanner(versionStr, tagline);
  if (size === 'mid') return midBanner(versionStr, tagline);
  return fullBanner(versionStr, tagline, hints);
}

function inlineBanner(versionStr: string, tagline: string): string {
  return `${theme.brand(theme.b('Mustard'))}${theme.muted(versionStr)}  ${theme.muted('·')}  ${theme.muted(tagline)}\n`;
}

function midBanner(versionStr: string, tagline: string): string {
  const wm = loadAsset('wordmark-mid.txt', wmMidCache).replace(/\n$/, '');
  const wmLines = wm.split('\n').map((l) => '  ' + theme.brand(l));
  return [
    '',
    ...wmLines,
    '',
    `  ${theme.brand(theme.b('Mustard'))}${theme.muted(versionStr)}  ${theme.muted('·')}  ${theme.muted(tagline)}`,
    '',
  ].join('\n');
}

function fullBanner(
  versionStr: string,
  tagline: string,
  hints: Array<{ cmd: string; desc: string }>,
): string {
  const wm = loadAsset('wordmark-full.txt', wmFullCache).replace(/\n$/, '');

  const wmLines = wm.split('\n').map((l) => '  ' + theme.brand(l));

  const lines: string[] = ['', ...wmLines, ''];
  lines.push(
    `  ${theme.brand(theme.b('Mustard'))}${theme.muted(versionStr)}  ${theme.muted('·')}  ${theme.muted(tagline)}`,
  );
  lines.push('');

  if (hints.length > 0) {
    const cmdMax = Math.max(...hints.map((h) => h.cmd.length));
    for (const h of hints) {
      const cmdPadded = h.cmd.padEnd(cmdMax, ' ');
      lines.push(`  ${theme.muted('→')}  ${theme.brand(cmdPadded)}      ${theme.muted(h.desc)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function brandGlyph(): string {
  return term.unicode ? '🌾' : '*';
}
