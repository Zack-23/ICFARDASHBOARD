// Groups sensor columns into "families" -- columns that represent the
// same measurement type across multiple probes (e.g. T01..T08 are all
// "temperature", VWC1..VWC4 are all "soil moisture"). A column's family
// key is its name with the digit run (the probe index) removed, so this
// works for any group's arbitrary column names -- not hardcoded to one
// site's sensor set. Mirrors analytics.py's column_family_key exactly.
// Place this at src/utils/columnFamilies.js

const FAMILY_PATTERN = /^(\D*)(\d+)(\D*)$/

export function columnFamilyKey(column) {
  const match = column.match(FAMILY_PATTERN)
  if (!match) return column
  const [, prefix, , suffix] = match
  return prefix + suffix
}

// Groups every column into its family. Returns a Map so each family's
// first-seen order is preserved -- keeps dropdowns stable across renders.
export function groupColumnsByFamily(columns) {
  const families = new Map()
  for (const column of columns) {
    const key = columnFamilyKey(column)
    if (!families.has(key)) families.set(key, [])
    families.get(key).push(column)
  }
  return families
}

// Given the full column list and one column picked as a representative,
// returns every column in that same family.
export function getFamilyMembers(columns, selectedColumn) {
  const key = columnFamilyKey(selectedColumn)
  return columns.filter((c) => columnFamilyKey(c) === key)
}