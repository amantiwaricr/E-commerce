'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readEnvFile, looksUnreadable, normaliseEncoding, decode } = require('../../scripts/env-file');

const BODY = 'PORT=5000\nMONGODB_URI=mongodb://127.0.0.1:27017/fmn\n# comment\n\nJWT_SECRET=abc\n';
const EXPECTED = { PORT: '5000', MONGODB_URI: 'mongodb://127.0.0.1:27017/fmn', JWT_SECRET: 'abc' };

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envfile-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name, buffer) => {
  const full = path.join(dir, name);
  fs.writeFileSync(full, buffer);
  return full;
};

const utf16le = (text, bom = true) =>
  Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(text, 'utf16le')]);
const utf16be = (text) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);
const utf8Bom = (text) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);

describe('reading a .env whatever wrote it', () => {
  it('reads plain UTF-8', () => {
    const file = readEnvFile(write('a.env', Buffer.from(BODY, 'utf8')));
    expect(file.values).toEqual(EXPECTED);
    expect(file.encoding).toBe('utf-8');
  });

  it('reads CRLF without leaving a carriage return in the value', () => {
    const file = readEnvFile(write('b.env', Buffer.from(BODY.replace(/\n/g, '\r\n'), 'utf8')));
    expect(file.values).toEqual(EXPECTED);
    expect(file.values.JWT_SECRET).not.toMatch(/\r/);
  });

  // Notepad's "UTF-8" writes a BOM, which otherwise glues itself to the first key.
  it('reads UTF-8 with a BOM', () => {
    const file = readEnvFile(write('c.env', utf8Bom(BODY)));
    expect(file.values).toEqual(EXPECTED);
    expect(file.encoding).toBe('utf-8-bom');
  });

  // PowerShell 5.1's `>` redirection writes UTF-16LE.
  it('reads UTF-16LE, with and without a BOM', () => {
    expect(readEnvFile(write('d.env', utf16le(BODY))).values).toEqual(EXPECTED);
    expect(readEnvFile(write('e.env', utf16le(BODY, false))).values).toEqual(EXPECTED);
  });

  it('reads UTF-16BE', () => {
    const file = readEnvFile(write('f.env', utf16be(BODY)));
    expect(file.values).toEqual(EXPECTED);
    expect(file.encoding).toBe('utf-16be');
  });

  it('accepts an exported line and strips surrounding quotes', () => {
    const file = readEnvFile(write('g.env', Buffer.from('export A="one"\nB=\'two\'\n', 'utf8')));
    expect(file.values).toEqual({ A: 'one', B: 'two' });
  });

  it('keeps an = that appears inside a value', () => {
    const file = readEnvFile(write('h.env', Buffer.from('URI=mongodb://h/db?a=1&b=2\n', 'utf8')));
    expect(file.values.URI).toBe('mongodb://h/db?a=1&b=2');
  });

  it('returns null for a file that is not there', () => {
    expect(readEnvFile(path.join(dir, 'nothing.env'))).toBeNull();
  });

  it('counts only lines that carry a setting', () => {
    expect(readEnvFile(write('i.env', Buffer.from('# just a comment\n\n', 'utf8'))).lines).toBe(0);
  });
});

describe('looksUnreadable', () => {
  it('flags a file with content but nothing parsed', () => {
    expect(looksUnreadable({ lines: 4, values: {} })).toBe(true);
  });

  it('does not flag a file that parsed, or an empty one', () => {
    expect(looksUnreadable({ lines: 4, values: { A: '1' } })).toBe(false);
    expect(looksUnreadable({ lines: 0, values: {} })).toBe(false);
    expect(looksUnreadable(null)).toBe(false);
  });
});

describe('normaliseEncoding', () => {
  it('rewrites UTF-16 as UTF-8 and keeps every value', () => {
    const full = write('j.env', utf16le(BODY));
    expect(normaliseEncoding(full)).toBe('utf-16le');
    expect(fs.readFileSync(full)[0]).not.toBe(0xff);
    const after = readEnvFile(full);
    expect(after.encoding).toBe('utf-8');
    expect(after.values).toEqual(EXPECTED);
  });

  it('strips a UTF-8 BOM', () => {
    const full = write('k.env', utf8Bom(BODY));
    expect(normaliseEncoding(full)).toBe('utf-8-bom');
    expect(fs.readFileSync(full, 'utf8').startsWith('PORT=')).toBe(true);
  });

  it('leaves a clean file alone', () => {
    const full = write('l.env', Buffer.from(BODY, 'utf8'));
    const before = fs.readFileSync(full);
    expect(normaliseEncoding(full)).toBe(false);
    expect(fs.readFileSync(full).equals(before)).toBe(true);
  });

  it('is safe to run twice', () => {
    const full = write('m.env', utf16le(BODY));
    normaliseEncoding(full);
    expect(normaliseEncoding(full)).toBe(false);
    expect(readEnvFile(full).values).toEqual(EXPECTED);
  });
});

describe('decode', () => {
  it('does not mistake a UTF-8 file containing accents for UTF-16', () => {
    expect(decode(Buffer.from('NAME=Café Bagmatī\n', 'utf8')).encoding).toBe('utf-8');
  });
});
