/**
 * Terminal capability detection for Mustard CLI.
 *
 * Read once at module load. Surfaces TTY status, width, color depth,
 * and Unicode capability so primitives can degrade gracefully.
 */

import supportsColor from 'supports-color';

export type ColorLevel = 0 | 1 | 2 | 3;
//                       │  │  │  └── truecolor (24-bit RGB)
//                       │  │  └── 256 color (xterm-256)
//                       │  └── ANSI 16
//                       └── no color (plain text)

const NO_COLOR = !!process.env.NO_COLOR;
const FORCE_COLOR = process.env.FORCE_COLOR;

function detectColorLevel(): ColorLevel {
  if (NO_COLOR) return 0;
  if (FORCE_COLOR === '0' || FORCE_COLOR === 'false') return 0;
  // supports-color exposes `level` 0–3 matching our enum exactly.
  const stdoutInfo = supportsColor.stdout;
  if (!stdoutInfo) return 0;
  return (stdoutInfo.level ?? 0) as ColorLevel;
}

function detectUnicode(): boolean {
  // Crude but effective: TERM-based detection. Modern Windows Terminal,
  // VS Code's integrated, iTerm, GNOME Terminal etc. all set TERM
  // properly. CMD legacy breaks this — gets fallback ASCII.
  const term = process.env.TERM ?? '';
  const wt = process.env.WT_SESSION; // Windows Terminal sets this
  if (wt) return true;
  if (process.platform === 'win32' && !process.env.MSYSTEM) {
    // bare cmd.exe — assume no full Unicode
    return false;
  }
  return /xterm|screen|tmux|cygwin|linux|ansi|color/i.test(term);
}

export const term = {
  isTTY: !!process.stdout.isTTY,
  /**
   * Width of the terminal in columns. Reads live, so this picks up
   * resizes between calls (unlike caching). Falls back to 80 when not
   * a TTY (CI logs, redirected output).
   */
  get width(): number {
    return process.stdout.columns ?? 80;
  },
  /**
   * Height of the terminal in rows. Live read.
   */
  get height(): number {
    return process.stdout.rows ?? 24;
  },
  colorLevel: detectColorLevel(),
  unicode: detectUnicode(),
} as const;

/** True if we should render decorative chrome (banners, animations, boxes). */
export const canRenderChrome = term.isTTY && term.colorLevel > 0;
