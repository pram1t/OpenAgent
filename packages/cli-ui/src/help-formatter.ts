/**
 * Custom commander help formatter using cli-ui primitives.
 *
 * Renders help in the Mustard layout:
 *
 *   <banner mid>
 *
 *   USAGE
 *     mustard <command> [options]
 *
 *   COMMANDS
 *     login              authenticate with the server
 *     ...
 *
 *   OPTIONS
 *     -h, --help         show help
 *     ...
 *
 *   EXAMPLES
 *     $ mustard login --as alice
 *     ...
 *
 *   LINKS
 *     docs       mustard.dev/docs
 *     issues     github.com/pram1t/Mustard/issues
 *
 * Set via:
 *   import { Command } from 'commander';
 *   import { helpFormatter } from '@pram1t/mustard-cli-ui';
 *   program.configureHelp(helpFormatter());
 */

import type { Command } from 'commander';
import { theme } from './theme.js';
import { banner } from './banner.js';
import { header } from './header.js';

export interface MustardHelpExtensions {
  /** A list of paste-able example invocations, shown under EXAMPLES. */
  examples?: string[];
  /** A list of [label, url] pairs shown under LINKS. */
  links?: Array<[label: string, url: string]>;
  /** Override the version shown in the banner. */
  version?: string;
}

const META = new WeakMap<Command, MustardHelpExtensions>();

/**
 * Attach Mustard-specific help metadata to a command.
 * Pass examples + links so the formatter can render them.
 */
export function withMustardHelp(cmd: Command, ext: MustardHelpExtensions): Command {
  META.set(cmd, ext);
  return cmd;
}

export function helpFormatter() {
  return {
    formatHelp(cmd: Command, helper: any): string {
      const ext = META.get(cmd) ?? {};
      const out: string[] = [];

      // Banner (only at top level — subcommands skip)
      if (cmd.parent === null || !cmd.parent) {
        out.push(banner({ size: 'mid', version: ext.version }));
      }

      // USAGE
      out.push(header('Usage'));
      out.push(`  ${theme.brand(helper.commandUsage(cmd))}`);
      out.push('');

      // COMMANDS
      const commands: Command[] = helper.visibleCommands(cmd);
      if (commands.length > 0) {
        out.push(header('Commands'));
        const namePad = Math.max(...commands.map((c) => helper.subcommandTerm(c).length));
        for (const c of commands) {
          const name = helper.subcommandTerm(c).padEnd(namePad, ' ');
          const desc = c.description();
          out.push(`  ${theme.b(name)}  ${theme.muted(desc)}`);
        }
        out.push('');
      }

      // OPTIONS
      const opts = helper.visibleOptions(cmd);
      if (opts.length > 0) {
        out.push(header('Options'));
        const flagPad = Math.max(...opts.map((o: any) => helper.optionTerm(o).length));
        for (const o of opts) {
          const flag = helper.optionTerm(o).padEnd(flagPad, ' ');
          const desc = helper.optionDescription(o);
          out.push(`  ${theme.muted(flag)}  ${theme.muted(desc)}`);
        }
        out.push('');
      }

      // EXAMPLES (custom)
      if (ext.examples && ext.examples.length > 0) {
        out.push(header('Examples'));
        for (const ex of ext.examples) {
          out.push(`  ${theme.muted('$')} ${ex.replace(/^\$\s*/, '')}`);
        }
        out.push('');
      }

      // LINKS (custom)
      if (ext.links && ext.links.length > 0) {
        out.push(header('Links'));
        const labelPad = Math.max(...ext.links.map(([l]) => l.length));
        for (const [l, u] of ext.links) {
          out.push(`  ${theme.muted(l.padEnd(labelPad, ' '))}  ${theme.brand(u)}`);
        }
        out.push('');
      }

      return out.join('\n');
    },
  };
}
