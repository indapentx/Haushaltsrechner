import { describe, expect, it } from 'vitest';
import { checkMonochrome } from '../../../scripts/check-monochrome.mjs';
import type { MonochromeViolation } from '../../../scripts/check-monochrome.mjs';

describe('non-negotiable #2: strictly monochrome', () => {
  it('finds no hue anywhere in the source', () => {
    const violations = checkMonochrome();
    const report = violations.map((v: MonochromeViolation) => `${v.file}:${v.line} ${v.name}: ${v.text}`);
    expect(report).toEqual([]);
  });
});
