/**
 * Themed table wrapper around cli-table3.
 *
 * Used for `mustard field list`, `mustard intent list`, etc.
 */

import Table from 'cli-table3';
import { theme } from './theme.js';
import { term } from './term.js';

export interface TableOptions {
  /** Column widths — pass undefined to auto-size. */
  colWidths?: (number | null)[];
  /** Header row labels. Required. */
  head: string[];
  /** When false, omits the outer borders for a tighter look (default true). */
  borders?: boolean;
}

export function table(opts: TableOptions, rows: Array<Array<string | number>>): string {
  const head = opts.head.map((h) => theme.b(h));
  const useBorders = opts.borders ?? true;

  const chars = useBorders
    ? {
        top: term.unicode ? '─' : '-',
        'top-mid': term.unicode ? '┬' : '+',
        'top-left': term.unicode ? '╭' : '+',
        'top-right': term.unicode ? '╮' : '+',
        bottom: term.unicode ? '─' : '-',
        'bottom-mid': term.unicode ? '┴' : '+',
        'bottom-left': term.unicode ? '╰' : '+',
        'bottom-right': term.unicode ? '╯' : '+',
        left: term.unicode ? '│' : '|',
        'left-mid': term.unicode ? '├' : '+',
        mid: term.unicode ? '─' : '-',
        'mid-mid': term.unicode ? '┼' : '+',
        right: term.unicode ? '│' : '|',
        'right-mid': term.unicode ? '┤' : '+',
        middle: term.unicode ? '│' : '|',
      }
    : {
        top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
        bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
        left: '', 'left-mid': '', mid: '', 'mid-mid': '',
        right: '', 'right-mid': '', middle: '  ',
      };

  // Only set colWidths when caller provided one — cli-table3 errors
  // when passed `undefined` instead of leaving it absent.
  const tableConfig: any = {
    head,
    chars,
    style: { head: [], border: [], 'padding-left': 1, 'padding-right': 1 },
  };
  if (opts.colWidths) tableConfig.colWidths = opts.colWidths;

  const t = new Table(tableConfig);

  for (const row of rows) {
    t.push(row.map((cell) => String(cell)));
  }

  // Recolor borders to mustard-muted so the table looks understated.
  return t
    .toString()
    .split('\n')
    .map((line) => line.replace(/[╭╮╰╯─│┼┬┴├┤+\-|]+/g, (m) => theme.muted(m)))
    .join('\n');
}
