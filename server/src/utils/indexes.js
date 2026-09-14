'use strict';

/**
 * Decides whether a collection index refers to fields the schema no longer has.
 *
 * Removing a field from a schema does not remove its index from MongoDB. A
 * leftover unique index is particularly damaging: every new document omits the
 * field, so they all collide on null and only the first insert succeeds.
 */
const indexPaths = (index) => {
  // Text indexes report internal _fts/_ftsx keys; their real fields are weights.
  if (index.key && index.key._fts) return Object.keys(index.weights || {});
  return Object.keys(index.key || {});
};

const isObsoleteIndex = (schema, index) => {
  if (!index || index.name === '_id_') return false;

  const paths = indexPaths(index);
  if (!paths.length) return false;

  // Obsolete as soon as any field is gone: a compound index on a removed field
  // can no longer serve the queries it was built for.
  return paths.some((path) => !schema.path(path) && !schema.singleNestedPaths?.[path]);
};

module.exports = { isObsoleteIndex, indexPaths };
