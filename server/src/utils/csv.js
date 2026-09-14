'use strict';

/**
 * Minimal RFC 4180 CSV writer used for admin exports.
 *
 * Values are quoted whenever they contain a delimiter, quote or newline, and
 * anything a spreadsheet would treat as a formula is prefixed with a single
 * quote so an order note like `=cmd|…` can never execute on open.
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_PREFIXES.includes(text.charAt(0))) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
};

/**
 * @param rows    any array of objects
 * @param columns `[{ key, label, value? }]` — `value(row)` overrides `row[key]`
 */
const toCsv = (rows = [], columns = []) => {
  const header = columns.map((column) => escapeCell(column.label ?? column.key)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value ? column.value(row) : row?.[column.key])).join(',')
  );
  // Excel only honours UTF-8 in a CSV when it is led by a byte-order mark, and
  // half of this store's data is in Nepali.
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
};

module.exports = { toCsv, escapeCell };
