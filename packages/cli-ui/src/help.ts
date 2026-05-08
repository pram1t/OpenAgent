/**
 * Help renderer — turns a structured help spec into a Mustard-themed
 * --help screen. Used by apps/cli/src/index.ts.
 *
 * Sections rendered (in order):
 *   USAGE
 *   COMMANDS
 *   OPTIONS
 *   PROVIDERS
 *   MODES
 *   EXAMPLES
 *   ENV
 *   LINKS
 */

import { theme } from './theme.js';
import { banner } from './banner.js';

export interface HelpCommand {
  cmd: string;
  desc: string;
}

export interface HelpOption {
  flags: string;
  desc: string;
}

export interface HelpSection {
  /** Section header (e.g. "USAGE", "COMMANDS"). */
  title: string;
  /** Two-column rows. */
  rows?: Array<[string, string]>;
  /** Single-column lines (used for usage lines or examples). */
  lines?: string[];
  /** Free-form note rendered after the rows/lines. */
  note?: string;
}

export interface HelpSpec {
  /** Banner version stamp. */
  version?: string;
  /** Optional override of tagline. */
  tagline?: string;
  /** Sections in render order. */
  sections: HelpSection[];
}

const INDENT = '  ';

export function renderHelp(spec: HelpSpec): string {
  const out: string[] = [];

  // Compact banner at top
  out.push(banner({ size: 'inline', version: spec.version, tagline: spec.tagline }));

  for (const section of spec.sections) {
    out.push(theme.b(section.title));
    if (section.rows && section.rows.length > 0) {
      const max = Math.max(...section.rows.map(([k]) => k.length));
      for (const [k, v] of section.rows) {
        const kPad = k.padEnd(max, ' ');
        out.push(`${INDENT}${theme.brand(kPad)}    ${theme.muted(v)}`);
      }
    }
    if (section.lines && section.lines.length > 0) {
      for (const l of section.lines) out.push(`${INDENT}${l}`);
    }
    if (section.note) {
      out.push('');
      out.push(`${INDENT}${theme.muted(section.note)}`);
    }
    out.push('');
  }

  return out.join('\n');
}
