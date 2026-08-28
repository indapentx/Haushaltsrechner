/**
 * Enforces non-negotiable #2 of the spec: strictly monochrome.
 *
 * Tailwind v4 silently ignores unknown utilities in templates rather than
 * failing the build, so wiping the palette is not on its own enough. This
 * scans the source for anything with a hue and exits non-zero.
 *
 * Run standalone (`npm run check:mono`), as `prebuild`, and from vitest.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = ['src', 'scripts'];
const SCAN_FILES = ['index.html'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html', '.svg']);
// This file necessarily names hues in its own patterns.
const SKIP = new Set(['scripts/check-monochrome.mjs']);

const HUES =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const TW_PREFIX =
  'bg|text|border|ring|outline|from|via|to|decoration|shadow|fill|stroke|accent|caret|divide|placeholder';

const PATTERNS = [
  {
    name: 'Tailwind colour utility',
    re: new RegExp(`\\b(?:${TW_PREFIX})-(?:${HUES})-\\d{2,3}\\b`, 'g'),
  },
  { name: 'named CSS colour', re: new RegExp(`(?<![\\w-])(?:${HUES})(?![\\w-])`, 'gi') },
  { name: 'oklch()/lab()/lch()/color()', re: /\b(?:oklch|oklab|lab|lch|color)\(/g },
  { name: 'emoji', re: /\p{Extended_Pictographic}/gu },
];

/** #rgb, #rgba, #rrggbb, #rrggbbaa — flagged unless R = G = B. */
function checkHex(line) {
  const hits = [];
  for (const m of line.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    const h = m[1];
    let r, g, b;
    if (h.length === 3 || h.length === 4) {
      [r, g, b] = [...h.slice(0, 3)].map((c) => parseInt(c + c, 16));
    } else if (h.length === 6 || h.length === 8) {
      [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    } else {
      continue;
    }
    if (!(r === g && g === b)) hits.push({ name: 'saturated hex', text: m[0] });
  }
  return hits;
}

/** rgb()/rgba() with unequal channels, hsl()/hwb() with non-zero saturation. */
function checkFunctional(line) {
  const hits = [];
  for (const m of line.matchAll(/\brgba?\(\s*([^)]+)\)/g)) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const [r, g, b] = parts;
      if (!(r === g && g === b)) hits.push({ name: 'saturated rgb()', text: m[0] });
    }
  }
  for (const m of line.matchAll(/\bhsla?\(\s*([^)]+)\)/g)) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const sat = parseFloat(parts[1]);
    if (Number.isFinite(sat) && sat !== 0) hits.push({ name: 'saturated hsl()', text: m[0] });
  }
  return hits;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SCAN_EXT.has(extname(full))) yield full;
  }
}

export function checkMonochrome() {
  const files = [
    ...SCAN_DIRS.flatMap((d) => [...walk(join(ROOT, d))]),
    ...SCAN_FILES.map((f) => join(ROOT, f)),
  ];
  const violations = [];

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (SKIP.has(rel)) continue;
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    source.split('\n').forEach((line, i) => {
      const hits = [...checkHex(line), ...checkFunctional(line)];
      for (const { re, name } of PATTERNS) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) hits.push({ name, text: m[0] });
      }
      for (const hit of hits) {
        violations.push({ file: rel, line: i + 1, ...hit });
      }
    });
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = checkMonochrome();
  if (violations.length === 0) {
    console.log('monochrome: clean');
  } else {
    console.error(`monochrome: ${violations.length} violation(s)\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.name}: ${v.text}`);
    }
    process.exit(1);
  }
}
