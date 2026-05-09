#!/usr/bin/env node
/**
 * Phase 02 — Prepare every publishable package for npm.
 *
 * For every `packages/*\/package.json`:
 *   - flip `private: true` → `private: false` (unless in EXCLUDE list)
 *   - bump `version` to `1.0.0-rc.1`
 *   - update description (replace OpenAgent → Mustard)
 *   - add repository, homepage, bugs URLs (pram1t/Mustard)
 *   - add publishConfig.access = "public"
 *   - add files = ["dist", "README.md", "LICENSE"]
 *   - add license = "MIT" (if missing)
 *   - add prepublishOnly script (if missing)
 *
 * Skips packages listed in EXCLUDE (test-utils stays private).
 *
 * Idempotent. Safe to re-run.
 *
 * Usage: node scripts/prepare-publish.mjs
 *        node scripts/prepare-publish.mjs --dry-run
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const PKG_DIR = join(ROOT, 'packages');
const TARGET_VERSION = '1.0.0-rc.7';
const REPO_URL = 'https://github.com/pram1t/Mustard.git';
const HOMEPAGE = 'https://github.com/pram1t/Mustard#readme';
const BUGS_URL = 'https://github.com/pram1t/Mustard/issues';
const EXCLUDE = new Set(['test-utils']); // stays private

const dryRun = process.argv.includes('--dry-run');
const changes = [];

for (const dir of readdirSync(PKG_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const name = dir.name;
  const pkgPath = join(PKG_DIR, name, 'package.json');
  if (!existsSync(pkgPath)) continue;

  const before = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(before);

  if (EXCLUDE.has(name)) {
    changes.push(`SKIP    ${pkg.name} (excluded — keeps private:true)`);
    continue;
  }

  // ── description ──
  if (typeof pkg.description === 'string') {
    pkg.description = pkg.description.replace(/OpenAgent/g, 'Mustard');
  }

  // ── private flag ──
  if (pkg.private === true) {
    delete pkg.private;
  }

  // ── version ──
  pkg.version = TARGET_VERSION;

  // ── license ──
  if (!pkg.license) pkg.license = 'MIT';

  // ── author ──
  if (!pkg.author) pkg.author = 'pram1t';

  // ── repo URLs ──
  pkg.repository = {
    type: 'git',
    url: REPO_URL,
    directory: `packages/${name}`,
  };
  pkg.homepage = HOMEPAGE;
  pkg.bugs = { url: BUGS_URL };

  // ── files ──
  pkg.files = ['dist', 'README.md', 'LICENSE'];

  // ── publishConfig ──
  pkg.publishConfig = {
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  };

  // ── scripts.prepublishOnly ──
  pkg.scripts ??= {};
  if (!pkg.scripts.prepublishOnly) {
    pkg.scripts.prepublishOnly = 'npm run clean && npm run build';
  }
  // clean must also remove tsbuildinfo or composite incremental builds skip emit
  pkg.scripts.clean = 'rm -rf dist tsconfig.tsbuildinfo';

  // ── reorder keys for readability ──
  const ORDER = [
    'name',
    'version',
    'description',
    'author',
    'license',
    'repository',
    'homepage',
    'bugs',
    'type',
    'main',
    'types',
    'exports',
    'bin',
    'files',
    'publishConfig',
    'scripts',
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ];
  const ordered = {};
  for (const k of ORDER) if (k in pkg) ordered[k] = pkg[k];
  for (const k of Object.keys(pkg)) if (!(k in ordered)) ordered[k] = pkg[k];

  const after = JSON.stringify(ordered, null, 2) + '\n';
  if (before === after) {
    changes.push(`unchg  ${pkg.name}`);
  } else {
    if (!dryRun) writeFileSync(pkgPath, after);
    changes.push(`UPDATE ${pkg.name}  v${TARGET_VERSION}`);
  }
}

console.log(changes.join('\n'));
console.log(`\n${dryRun ? '[dry-run] ' : ''}done — ${changes.filter(c => c.startsWith('UPDATE')).length} package.json files updated`);
