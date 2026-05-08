import terminalLink from 'terminal-link';
import { theme } from './theme.js';

/**
 * Hyperlink — uses OSC 8 in supporting terminals (iTerm, Hyper, Windows
 * Terminal, VS Code), falls back to `<label> (<url>)` plain text.
 *
 * Always brand-colored + underlined for visual identity.
 */
export function link(label: string, url: string): string {
  const styled = theme.brand(theme.u(label));
  if (terminalLink.isSupported) {
    return terminalLink(styled, url);
  }
  // Fallback: print label and URL separately
  return `${styled} ${theme.muted(`(${url})`)}`;
}
