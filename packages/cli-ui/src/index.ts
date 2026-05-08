/**
 * @pram1t/mustard-cli-ui — visual identity primitives for the Mustard CLI.
 *
 * One palette, one banner, one renderer set. Consumers import from this
 * single entry point.
 */

export { theme, type Theme } from './theme.js';
export { term, canRenderChrome, type ColorLevel } from './term.js';
export { banner, brandGlyph, type BannerSize, type BannerOptions } from './banner.js';
export {
  kv,
  success,
  warn,
  error,
  info,
  header,
  divider,
  list,
  link,
  dots,
  type SurfaceOpts,
} from './primitives.js';
export { bootBanner } from './animations.js';
export { setTitle, clearTitle } from './term-title.js';
export { renderHelp, type HelpSpec, type HelpSection, type HelpCommand, type HelpOption } from './help.js';
