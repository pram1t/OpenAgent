/**
 * Semantic status surfaces — success / warn / error / info.
 *
 * Each returns a multi-line string ready for `console.log`. Pair the
 * outcome icon with the brand-coded label so a11y users / NO_COLOR
 * users still understand without color.
 */

import { theme } from './theme.js';
import { term } from './term.js';

const ICONS = {
  success: term.unicode ? '✓' : '+',
  error: term.unicode ? '✗' : 'x',
  warn: term.unicode ? '!' : '!',
  info: term.unicode ? 'ⓘ' : 'i',
  arrow: term.unicode ? '→' : '->',
  dot: term.unicode ? '●' : '*',
  ring: term.unicode ? '○' : 'o',
} as const;

export interface SuccessOptions {
  detail?: string;
}

export function success(message: string, opts: SuccessOptions = {}): string {
  const head = `${theme.success(ICONS.success)}  ${theme.b(message)}`;
  if (!opts.detail) return head;
  const indented = opts.detail
    .split('\n')
    .map((l) => '   ' + l)
    .join('\n');
  return `${head}\n\n${indented}`;
}

export interface WarnOptions {
  detail?: string;
}

export function warn(message: string, opts: WarnOptions = {}): string {
  const head = `${theme.warn(ICONS.warn)}  ${theme.b(message)}`;
  if (!opts.detail) return head;
  const indented = opts.detail
    .split('\n')
    .map((l) => '   ' + theme.muted(l))
    .join('\n');
  return `${head}\n${indented}`;
}

export interface ErrorOptions {
  /** A short next-step hint shown indented after the error message. */
  hint?: string;
  detail?: string;
}

export function error(message: string, opts: ErrorOptions = {}): string {
  const head = `${theme.error(ICONS.error)}  ${theme.b(message)}`;
  const lines: string[] = [head];
  if (opts.detail) {
    lines.push('');
    lines.push(
      ...opts.detail.split('\n').map((l) => '   ' + theme.muted(l)),
    );
  }
  if (opts.hint) {
    lines.push('');
    lines.push(`   ${theme.muted(ICONS.arrow)} ${theme.muted(opts.hint)}`);
  }
  return lines.join('\n');
}

export interface InfoOptions {
  detail?: string;
}

export function info(message: string, opts: InfoOptions = {}): string {
  const head = `${theme.info(ICONS.info)}  ${message}`;
  if (!opts.detail) return head;
  const indented = opts.detail
    .split('\n')
    .map((l) => '   ' + theme.muted(l))
    .join('\n');
  return `${head}\n${indented}`;
}
