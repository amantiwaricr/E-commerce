'use strict';

/**
 * Reads a KEY=value file the way the tooling needs it.
 *
 * Encoding is the whole reason this exists. On Windows the two easiest ways to
 * create a `.env` both produce a file Node cannot read as UTF-8:
 *
 *   PowerShell 5.1:  `"X=1" > .env`   writes UTF-16LE with a BOM
 *   Notepad:         Save as UTF-8     writes UTF-8 *with* a BOM
 *
 * A UTF-16 file read as UTF-8 is mostly NUL bytes, and a leading BOM glues
 * itself to the first key name. Either way every line fails to parse and the
 * file looks empty — to this script, to `dotenv`, and to Vite. The app then
 * silently falls back to its defaults, which work in development, so nothing
 * looks wrong until something needs a real value.
 */

const fs = require('fs');

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** Decodes a buffer, honouring a BOM and detecting UTF-16 without one. */
const decode = (buffer) => {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return { text: buffer.toString('utf16le', 2), encoding: 'utf-16le' };
    // Node cannot decode big-endian directly; swap it into little-endian first.
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return { text: Buffer.from(buffer.subarray(2)).swap16().toString('utf16le'), encoding: 'utf-16be' };
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.toString('utf8', 3), encoding: 'utf-8-bom' };
  }

  // No BOM. A UTF-16LE file of ASCII text is every other byte NUL, which is
  // never true of a real .env.
  const sample = buffer.subarray(0, 200);
  const nuls = sample.filter((b) => b === 0).length;
  if (sample.length > 4 && nuls > sample.length / 4) {
    const odd = sample.filter((b, i) => i % 2 === 1 && b === 0).length;
    const even = sample.filter((b, i) => i % 2 === 0 && b === 0).length;
    if (odd > even) return { text: buffer.toString('utf16le'), encoding: 'utf-16le' };
    return { text: Buffer.from(buffer).swap16().toString('utf16le'), encoding: 'utf-16be' };
  }

  return { text: buffer.toString('utf8'), encoding: 'utf-8' };
};

/**
 * @returns `null` when the file is absent, otherwise
 *          `{ values, encoding, lines, path }`.
 */
const readEnvFile = (full) => {
  if (!fs.existsSync(full)) return null;

  const { text, encoding } = decode(fs.readFileSync(full));
  const values = {};
  let lines = 0;

  // \r\n and the old Mac \r both split here, so a CR never ends up in a value.
  text.split(/\r\n|\n|\r/).forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    lines += 1;
    const match = line.match(LINE);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  });

  return { values, encoding, lines, path: full };
};

/** True when the file has content but none of it parsed — almost always encoding. */
const looksUnreadable = (file) => Boolean(file && file.lines > 0 && Object.keys(file.values).length === 0);

/** Rewrites a file as plain UTF-8 with no BOM, preserving its text. */
const normaliseEncoding = (full) => {
  const { text, encoding } = decode(fs.readFileSync(full));
  if (encoding === 'utf-8') return false;
  fs.writeFileSync(full, text.replace(/^﻿/, ''), 'utf8');
  return encoding;
};

module.exports = { readEnvFile, looksUnreadable, normaliseEncoding, decode };
