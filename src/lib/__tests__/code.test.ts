import { describe, expect, it } from 'vitest';
import { isCompleteJoinCode, normalizeJoinCode } from '../code';

describe('normalizeJoinCode', () => {
  it('leaves a well-formed code alone', () => {
    expect(normalizeJoinCode('YAY5-TZFT')).toBe('YAY5-TZFT');
  });

  it('accepts it without the dash', () => {
    expect(normalizeJoinCode('YAY5TZFT')).toBe('YAY5-TZFT');
  });

  it('accepts lower case', () => {
    expect(normalizeJoinCode('yay5-tzft')).toBe('YAY5-TZFT');
  });

  it('survives the spacing a copy from the screen can pick up', () => {
    expect(normalizeJoinCode('Y A Y 5 - T Z F T')).toBe('YAY5-TZFT');
    expect(normalizeJoinCode('  YAY5 – TZFT  ')).toBe('YAY5-TZFT');
  });

  it('ignores anything else pasted along with it', () => {
    expect(normalizeJoinCode('code: YAY5-TZFT!')).toBe('YAY5-TZFT');
  });

  it('builds up as you type', () => {
    expect(normalizeJoinCode('Y')).toBe('Y');
    expect(normalizeJoinCode('YAY5')).toBe('YAY5');
    expect(normalizeJoinCode('YAY5T')).toBe('YAY5-T');
  });

  it('stops at eight characters', () => {
    expect(normalizeJoinCode('YAY5TZFTEXTRA')).toBe('YAY5-TZFT');
  });

  it('copes with nothing', () => {
    expect(normalizeJoinCode('')).toBe('');
  });
});

describe('isCompleteJoinCode', () => {
  it('is true only for a full code', () => {
    expect(isCompleteJoinCode('YAY5-TZFT')).toBe(true);
    expect(isCompleteJoinCode('yay5tzft')).toBe(true);
    expect(isCompleteJoinCode('YAY5-TZF')).toBe(false);
    expect(isCompleteJoinCode('')).toBe(false);
  });
});
