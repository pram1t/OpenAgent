/**
 * Mustard theme — palette + semantic role functions.
 *
 * Consumers always go through role functions (theme.brand(s), theme.dim(s), etc.).
 * Never raw hex/ANSI in app code. The theme handles graceful degradation
 * across truecolor / 256 / 16 / NO_COLOR terminals.
 */

import pc from 'picocolors';
import { term } from './term.js';

// ─── Truecolor palette (24-bit terminals — modern default) ───────────────

const TRUECOLOR = {
  brand: '#FFD971',     // light butter-gold (replaces darker mustard for v1.0)
  deep: '#E1A95F',      // warm mustard, kept for emphasis
  accent: '#FFEC8B',    // very pale cream, highlights/progress fills
  ink: '#0B0B0B',       // matte black background, used sparingly
  fg: '#EFEAD8',        // warm off-white text
  muted: '#7A7468',     // warm dim, secondary text
  warn: '#FFC857',      // amber warn (countdowns, "do this first")
  error: '#E07A5F',     // terracotta red — warmer than pure red
  info: '#A8C9D6',      // pale steel-blue, used sparingly
  codeFg: '#EFEAD8',
  codeBg: '#1A1A1A',
} as const;

// ─── 256-color fallback (xterm-256) ──────────────────────────────────────

const XTERM256 = {
  brand: 222,    // closer to #FFD971 (light butter-gold)
  deep: 179,
  accent: 229,
  fg: 230,
  muted: 244,
  warn: 215,
  error: 173,
  info: 109,
} as const;

// ─── ANSI 16 fallback (basic terminals + CI) ─────────────────────────────

type AnsiFn = (s: string) => string;
const ANSI16: Record<string, AnsiFn> = {
  brand: pc.yellow,
  deep: pc.yellowBright,
  accent: pc.yellow,
  fg: pc.white,
  muted: pc.gray,
  warn: pc.yellow,
  error: pc.red,
  info: pc.cyan,
};

// ─── ANSI escape helpers for truecolor + 256 ─────────────────────────────

function rgbAnsi(hex: string): { open: string; close: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { open: '', close: '' };
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return { open: `\x1b[38;2;${r};${g};${b}m`, close: '\x1b[39m' };
}

function indexAnsi(idx: number): { open: string; close: string } {
  return { open: `\x1b[38;5;${idx}m`, close: '\x1b[39m' };
}

function makeRoleFn(level: 0 | 1 | 2 | 3, role: keyof typeof TRUECOLOR): AnsiFn {
  if (level === 0) return (s) => s; // identity-pass
  if (level === 1) {
    const fn = ANSI16[role];
    return fn ?? ((s) => s);
  }
  if (level === 2 && role in XTERM256) {
    const idx = XTERM256[role as keyof typeof XTERM256];
    const { open, close } = indexAnsi(idx);
    return (s) => `${open}${s}${close}`;
  }
  // truecolor (level 3) and any 256-fallback miss
  const hex = TRUECOLOR[role];
  const { open, close } = rgbAnsi(hex);
  return (s) => `${open}${s}${close}`;
}

// ─── Public theme API ────────────────────────────────────────────────────

const lvl = term.colorLevel;

export const theme = {
  /** Primary mustard yellow — wordmark, accents, brand glyph, hyperlinks. */
  brand: makeRoleFn(lvl, 'brand'),
  /** Deep mustard — emphasis, headings (rare). */
  deep: makeRoleFn(lvl, 'deep'),
  /** Bright mustard — success ✓, progress fills, highlights. */
  accent: makeRoleFn(lvl, 'accent'),
  /** Default foreground (often omitted; identity in NO_COLOR). */
  fg: makeRoleFn(lvl, 'fg'),
  /** Dim/secondary — descriptions, hints, muted lines. */
  muted: makeRoleFn(lvl, 'muted'),
  /** Success — currently aliased to brand (mustard double-duty). */
  success: makeRoleFn(lvl, 'brand'),
  /** Warning — countdowns, "do this first" hints. */
  warn: makeRoleFn(lvl, 'warn'),
  /** Error — failures, ✗ outcomes. Never decorative. */
  error: makeRoleFn(lvl, 'error'),
  /** Info — restrained steel-blue, used sparingly. */
  info: makeRoleFn(lvl, 'info'),

  // ─── style helpers (work in all color levels) ──────────────────────
  /** Bold. */
  b: (s: string) => (lvl === 0 ? s : pc.bold(s)),
  /** Dim — alias of muted; safer for CI-style dimming. */
  dim: (s: string) => (lvl === 0 ? s : pc.dim(s)),
  /** Underline — used for hyperlinks alongside brand color. */
  u: (s: string) => (lvl === 0 ? s : pc.underline(s)),
  /** Italic. */
  i: (s: string) => (lvl === 0 ? s : pc.italic(s)),
  /** Inline code style — fg on dark bg if truecolor, else just dim. */
  code: (s: string): string => {
    if (lvl === 0) return s;
    if (lvl >= 3) {
      const fg = rgbAnsi(TRUECOLOR.codeFg);
      // bg via 48;2;r;g;b
      const m = /^#?([0-9a-f]{6})$/i.exec(TRUECOLOR.codeBg);
      if (m) {
        const n = parseInt(m[1], 16);
        const r = (n >> 16) & 0xff;
        const g = (n >> 8) & 0xff;
        const b = n & 0xff;
        return `${fg.open}\x1b[48;2;${r};${g};${b}m${s}\x1b[49m${fg.close}`;
      }
    }
    return pc.dim(s);
  },
} as const;

export type Theme = typeof theme;
