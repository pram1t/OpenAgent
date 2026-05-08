/**
 * Mustard cli-ui demo.
 *
 * Run from repo root:  node packages/cli-ui/scripts/demo.mjs
 *
 * Renders the boot banner + every status surface side-by-side so you
 * can see the locked design before code wires it into apps/cli.
 */

import {
  banner,
  success,
  warn,
  error,
  info,
  kv,
  header,
  divider,
  list,
  link,
  dots,
  theme,
} from '../dist/index.js';

console.log('\n');
console.log(theme.muted('============================================================'));
console.log('  ' + header('boot banner'));
console.log(theme.muted('============================================================'));
console.log(banner({ size: 'full', version: '1.0.0-rc.6' }));

console.log(theme.muted('============================================================'));
console.log('  ' + header('login success'));
console.log(theme.muted('============================================================'));
console.log(
  success('logged in as alice', {
    fields: [
      ['identity', 'alice'],
      ['token', 'good for 1 hour'],
      ['server', '127.0.0.1:3200'],
    ],
    hints: [{ cmd: 'mustard field create "<name>"', desc: 'start a session' }],
  }),
);

console.log(theme.muted('============================================================'));
console.log('  ' + header('field sown (after `field create`)'));
console.log(theme.muted('============================================================'));
console.log(
  success('field sown', {
    detail: theme.b('auth refactor'),
    fields: [
      ['id', '6f2a8e1c-9d3b-4f7a-b1e2-c8d9a0f12345'],
      ['mode', 'plan'],
      ['link', link('mustard.dev/field/6f2a…2345', 'https://mustard.dev/field/6f2a8e1c')],
    ],
    hints: [{ cmd: 'mustard tail 6f2a…2345', desc: 'watch live events' }],
  }),
);

console.log(theme.muted('============================================================'));
console.log('  ' + header('intent sown (after `sow`)'));
console.log(theme.muted('============================================================'));
console.log(
  success('intent sown  ·  #int_a8c2', {
    detail: 'counted in 10s if no one objects',
  }),
);

console.log(theme.muted('============================================================'));
console.log('  ' + header('reaped'));
console.log(theme.muted('============================================================'));
console.log(success('reaped  ·  1 file modified  ·  28 lines'));

console.log(theme.muted('============================================================'));
console.log('  ' + header('errors'));
console.log(theme.muted('============================================================'));
console.log(
  error('refused', {
    detail: '.env paths require manual approval',
    hints: [{ cmd: 'mustard sow "..." --ask alice', desc: 'add an approver' }],
  }),
);
console.log(
  error('cannot reach server', {
    detail: 'tried http://127.0.0.1:3200',
    hints: [
      { cmd: 'check the server is running' },
      { cmd: 'mustard login --base <url>', desc: 'or pass a different url' },
    ],
  }),
);

console.log(theme.muted('============================================================'));
console.log('  ' + header('warning (already logged in)'));
console.log(theme.muted('============================================================'));
console.log(
  warn('already logged in as alice', {
    detail: 'token still valid for 53 min',
    hints: [
      { cmd: 'mustard logout', desc: 'to switch' },
      { cmd: 'mustard --help', desc: 'see all commands' },
    ],
  }),
);

console.log(theme.muted('============================================================'));
console.log('  ' + header('inline banner (`mustard --version` or narrow term)'));
console.log(theme.muted('============================================================'));
console.log(banner({ size: 'inline', version: '1.0.0-rc.6' }));

console.log(theme.muted('============================================================'));
console.log('  ' + header('status dots'));
console.log(theme.muted('============================================================'));
console.log(`  ${dots.online} connected`);
console.log(`  ${dots.offline} idle`);
console.log('');
