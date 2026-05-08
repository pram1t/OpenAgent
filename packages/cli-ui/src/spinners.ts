/**
 * Mustard's custom Braille-pattern spinner sequences for ora.
 *
 * Four sequences chosen to tell tiny brand stories:
 *   germinating   — seed grows then collapses (HERO; long ops)
 *   orbiting      — single dot rotating through Braille cell (quick API)
 *   twoSeedFork   — two dots on parallel paths (multi-agent / tail connect)
 *   sproutingBar  — growing-fill progress (deterministic forward motion)
 *
 * All Unicode U+2800–U+28FF (Braille) — no decorative ASCII fallback
 * because spinners are decorative-only and we just disable them in
 * non-Unicode environments.
 */

import oraDefault, { type Options as OraOptions, type Ora } from 'ora';
import { term } from './term.js';

export interface SpinnerFrames {
  interval: number;
  frames: string[];
}

export const spinners: Record<string, SpinnerFrames> = {
  germinating: {
    interval: 80,
    frames: ['⠁', '⠃', '⠇', '⡇', '⣇', '⣧', '⣷', '⣿', '⣷', '⣧', '⣇', '⡇', '⠇', '⠃', '⠁', '⠀'],
  },
  orbiting: {
    interval: 80,
    frames: ['⠈', '⠐', '⠠', '⢀', '⡀', '⠄', '⠂', '⠁'],
  },
  twoSeedFork: {
    interval: 70,
    frames: [
      '⢀⠀', '⡀⠀', '⠄⠀', '⠂⠀', '⠁⠀', '⠈⠀', '⠐⠀', '⠠⠀',
      '⠀⢀', '⠀⡀', '⠀⠄', '⠀⠂', '⠀⠁', '⠀⠈', '⠀⠐', '⠀⠠',
    ],
  },
  sproutingBar: {
    interval: 100,
    frames: ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'],
  },
} as const;

export type SpinnerName = keyof typeof spinners;

const FALLBACK_FRAMES: SpinnerFrames = {
  interval: 100,
  frames: ['|', '/', '-', '\\'],
};

/**
 * Create an ora spinner with a Mustard-themed Braille sequence.
 *
 * If the terminal can't render Unicode (TERM=dumb, raw cmd.exe), falls
 * back to ASCII spinner. If output isn't a TTY (CI logs), ora itself
 * silently no-ops the animation but still allows .succeed/.fail to log.
 */
export function spinner(
  name: SpinnerName,
  text: string,
  opts: Partial<OraOptions> = {},
): Ora {
  const frames = term.unicode ? spinners[name] : FALLBACK_FRAMES;
  return oraDefault({
    spinner: frames,
    text,
    color: 'yellow',
    ...opts,
  });
}
