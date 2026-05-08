/**
 * Mustard CLI primitives — everything that isn't the boot banner.
 *
 * Voice locked per design/brand-voice.md:
 * - lowercase by default
 * - no exclamation marks
 * - errors point at cause + offer one or two next-step arrows
 * - success surfaces use ✓; warn use !; error use ✗
 */

import { theme } from './theme.js';
import { term } from './term.js';

// ─── Glyphs ──────────────────────────────────────────────────────────────

const G = term.unicode
  ? { ok: '✓', warn: '!', err: '✗', arrow: '→', dot: '·', online: '●', offline: '○', bullet: '•' }
  : { ok: '+', warn: '!', err: 'X', arrow: '->', dot: '*', online: 'o', offline: '.', bullet: '*' };

// ─── kv: aligned key/value table ─────────────────────────────────────────

export function kv(
  pairs: Array<[string, string]> | Record<string, string>,
  opts: { keyColor?: 'muted' | 'fg'; indent?: string } = {},
): string {
  const arr: Array<[string, string]> = Array.isArray(pairs)
    ? pairs
    : (Object.entries(pairs) as Array<[string, string]>);
  if (arr.length === 0) return '';
  const indent = opts.indent ?? '   ';
  const keyColor = opts.keyColor ?? 'muted';
  const max = Math.max(...arr.map(([k]) => k.length));
  return arr
    .map(([k, v]) => {
      const keyPad = k.padEnd(max, ' ');
      const styledKey = keyColor === 'muted' ? theme.muted(keyPad) : theme.fg(keyPad);
      return `${indent}${styledKey}   ${v}`;
    })
    .join('\n');
}

// ─── status surfaces: success / warn / error / info ──────────────────────

export interface SurfaceOpts {
  /** Sub-line aligned under the headline. */
  detail?: string;
  /** kv block (rendered below the headline). */
  fields?: Array<[string, string]>;
  /** "next-step" arrows (rendered below the kv block). */
  hints?: Array<{ cmd: string; desc?: string }>;
}

function renderHints(hints: Array<{ cmd: string; desc?: string }>): string {
  if (hints.length === 0) return '';
  const cmdMax = Math.max(...hints.map((h) => h.cmd.length));
  return hints
    .map((h) => {
      const cmd = theme.brand(h.cmd.padEnd(cmdMax, ' '));
      const desc = h.desc ? theme.muted(`     ${h.desc}`) : '';
      return `  ${theme.muted(G.arrow)}  ${cmd}${desc}`;
    })
    .join('\n');
}

function renderSurface(
  glyph: string,
  glyphColor: (s: string) => string,
  headline: string,
  opts: SurfaceOpts,
): string {
  const lines: string[] = ['', `  ${glyphColor(glyph)}  ${theme.b(headline)}`];
  if (opts.detail) lines.push(`     ${theme.muted(opts.detail)}`);
  if (opts.fields && opts.fields.length > 0) {
    lines.push('');
    lines.push(kv(opts.fields, { indent: '     ' }));
  }
  if (opts.hints && opts.hints.length > 0) {
    lines.push('');
    lines.push(renderHints(opts.hints));
  }
  lines.push('');
  return lines.join('\n');
}

export function success(headline: string, opts: SurfaceOpts = {}): string {
  return renderSurface(G.ok, theme.brand, headline, opts);
}

export function warn(headline: string, opts: SurfaceOpts = {}): string {
  return renderSurface(G.warn, theme.warn, headline, opts);
}

export function error(headline: string, opts: SurfaceOpts = {}): string {
  return renderSurface(G.err, theme.error, headline, opts);
}

export function info(headline: string, opts: SurfaceOpts = {}): string {
  return renderSurface(G.dot, theme.info, headline, opts);
}

// ─── header / divider / list ─────────────────────────────────────────────

export function header(title: string): string {
  return theme.b(title.toUpperCase());
}

export function divider(width?: number): string {
  const w = Math.min(width ?? term.width - 4, 80);
  return theme.muted('─'.repeat(w));
}

export function list(items: string[], opts: { indent?: string } = {}): string {
  const indent = opts.indent ?? '  ';
  return items.map((i) => `${indent}${theme.muted(G.bullet)} ${i}`).join('\n');
}

// ─── link (terminal hyperlink) ───────────────────────────────────────────

export function link(label: string, url: string): string {
  // OSC 8 hyperlink — supported by most modern terminals; falls back
  // to plain `label (url)` if the env doesn't render it.
  if (term.isTTY) {
    return `\x1b]8;;${url}\x07${theme.brand(theme.u(label))}\x1b]8;;\x07`;
  }
  return `${theme.brand(label)} (${url})`;
}

// ─── status dots for "● connected" / "○ idle" ────────────────────────────

export const dots = {
  online: theme.brand(G.online),
  offline: theme.muted(G.offline),
} as const;
