/**
 * Mustard animations — boot fade-in + future motion primitives.
 *
 * Uses log-update to redraw the same line range across frames. All
 * animations no-op in non-TTY environments (CI, redirected output) so
 * logs stay clean.
 */

import logUpdate from 'log-update';
import { theme } from './theme.js';
import { term } from './term.js';
import { banner, type BannerOptions } from './banner.js';

/**
 * Print the boot banner with a 3-frame brightness fade-in.
 *
 * Frame 1: skeleton (dim gray) → wordmark visible but de-emphasized
 * Frame 2: deep mustard → wordmark in mid-tone
 * Frame 3: full brand → final, persistent (printed via stdout)
 *
 * Total cycle: ~200ms. Skipped in non-TTY.
 */
export async function bootBanner(opts: BannerOptions = {}): Promise<void> {
  if (!term.isTTY || term.colorLevel === 0) {
    process.stdout.write(banner(opts));
    return;
  }

  // Render each frame with a different theme override. We re-derive the
  // banner string each time so the fade flows through wordmark + tagline
  // + hint lines uniformly.
  const skeleton = banner(opts).replace(
    /\x1b\[(?:38;2;\d+;\d+;\d+|38;5;\d+|33|93|1)m/g,
    '\x1b[2;37m', // dim white
  );
  const mid = banner(opts).replace(/\x1b\[38;2;255;217;113m/g, '\x1b[38;2;201;162;39m'); // brand → deep
  const full = banner(opts);

  logUpdate(skeleton);
  await sleep(80);
  logUpdate(mid);
  await sleep(80);
  logUpdate.clear();
  logUpdate.done();
  process.stdout.write(full);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
