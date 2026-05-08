/**
 * Set / clear the terminal window title via OSC sequences.
 * Works in Windows Terminal, iTerm, GNOME Terminal, Alacritty,
 * VS Code integrated, Hyper. No-op in non-TTY.
 */

import { term } from './term.js';

/**
 * Set the terminal title. Returns silently if non-TTY.
 *
 *   setTitle('Mustard — alice')
 *   setTitle('Mustard — alice@auth-refactor')
 */
export function setTitle(title: string): void {
  if (!term.isTTY) return;
  // OSC 0 sets icon name + window title. \x07 (BEL) terminates.
  process.stdout.write(`\x1b]0;${title}\x07`);
}

/** Reset the terminal title to whatever the parent process named it. */
export function clearTitle(): void {
  if (!term.isTTY) return;
  process.stdout.write(`\x1b]0;\x07`);
}
