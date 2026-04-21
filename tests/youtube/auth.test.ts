import { describe, it, expect } from 'vitest';
import { parseHeadersFromInput, generateSAPISIDHASH, extractSAPISID } from '../../src/youtube/auth.js';

describe('parseHeadersFromInput', () => {
  it('extracts cookie from cURL with single quotes', () => {
    const input = `curl 'https://music.youtube.com/youtubei/v1/search' \\
  -H 'Cookie: SAPISID=abc123; HSID=xyz' \\
  -H 'Origin: https://music.youtube.com'`;
    expect(parseHeadersFromInput(input)).toBe('SAPISID=abc123; HSID=xyz');
  });

  it('extracts cookie from cURL with double quotes', () => {
    const input = `curl "https://music.youtube.com/youtubei/v1/search" \\
  -H "Cookie: SAPISID=abc123; HSID=xyz" \\
  -H "Origin: https://music.youtube.com"`;
    expect(parseHeadersFromInput(input)).toBe('SAPISID=abc123; HSID=xyz');
  });

  it('extracts cookie from --header format', () => {
    const input = `curl 'https://music.youtube.com/' --header 'Cookie: SAPISID=test456'`;
    expect(parseHeadersFromInput(input)).toBe('SAPISID=test456');
  });

  it('extracts cookie from raw header lines', () => {
    const input = `Host: music.youtube.com
Cookie: SAPISID=raw789; OTHER=val
Origin: https://music.youtube.com`;
    expect(parseHeadersFromInput(input)).toBe('SAPISID=raw789; OTHER=val');
  });

  it('extracts cookie from JSON format', () => {
    const input = JSON.stringify({ cookie: 'SAPISID=json123; HSID=abc' });
    expect(parseHeadersFromInput(input)).toBe('SAPISID=json123; HSID=abc');
  });

  it('handles case-insensitive cookie header', () => {
    const input = `cookie: SAPISID=lower123`;
    expect(parseHeadersFromInput(input)).toBe('SAPISID=lower123');
  });

  it('throws when no cookie found', () => {
    expect(() => parseHeadersFromInput('no cookie here')).toThrow(
      'Could not find a Cookie header',
    );
  });

  it('throws on empty input', () => {
    expect(() => parseHeadersFromInput('')).toThrow('Could not find a Cookie header');
  });
});

describe('extractSAPISID', () => {
  it('extracts SAPISID from cookie string', () => {
    expect(extractSAPISID('HSID=abc; SAPISID=my_sapisid_value; SSID=xyz')).toBe(
      'my_sapisid_value',
    );
  });

  it('extracts __Secure-3PAPISID when SAPISID is absent', () => {
    expect(extractSAPISID('HSID=abc; __Secure-3PAPISID=secure_value; SSID=xyz')).toBe(
      'secure_value',
    );
  });

  it('prefers SAPISID over __Secure-3PAPISID (SAPISIDHASH scheme)', () => {
    expect(
      extractSAPISID('SAPISID=regular; __Secure-3PAPISID=secure; SSID=xyz'),
    ).toBe('regular');
  });

  it('does not confuse __Secure-3PAPISID substring with SAPISID', () => {
    expect(
      extractSAPISID('HSID=abc; __Secure-3PAPISID=secure_value; SSID=xyz'),
    ).toBe('secure_value');
  });

  it('throws when neither SAPISID nor __Secure-3PAPISID present', () => {
    expect(() => extractSAPISID('HSID=abc; SSID=xyz')).toThrow(
      'Could not find SAPISID',
    );
  });
});

describe('generateSAPISIDHASH', () => {
  it('returns a string starting with SAPISIDHASH', () => {
    const result = generateSAPISIDHASH('test_sapisid', 'https://music.youtube.com');
    expect(result).toMatch(/^SAPISIDHASH \d+_[a-f0-9]{40}$/);
  });

  it('uses current timestamp', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = generateSAPISIDHASH('test', 'https://music.youtube.com');
    const after = Math.floor(Date.now() / 1000);

    const timestamp = parseInt(result.split(' ')[1].split('_')[0], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = generateSAPISIDHASH('sapisid1', 'https://music.youtube.com');
    const hash2 = generateSAPISIDHASH('sapisid2', 'https://music.youtube.com');
    const hex1 = hash1.split('_')[1];
    const hex2 = hash2.split('_')[1];
    expect(hex1).not.toBe(hex2);
  });
});
