## 2026-10-26 - Loop Invariants in React useMemo Filters
**Learning:** Extracting string manipulation loop invariants (like `.trim().toLowerCase()`) out of `Array.prototype.filter` inside a `useMemo` significantly reduces unnecessary work on large lists. Additionally, checking cheap boolean conditions before creating arrays and doing string searches leverages short-circuiting to skip expensive operations.
**Action:** Always move static calculations outside of iterator callbacks and order filter conditions from cheapest (booleans) to most expensive (string operations/array allocations) using short-circuit evaluation.

## 2026-10-26 - Intl.Collator for Sorting
**Learning:** Calling `String.prototype.localeCompare` inside `.sort()` callbacks across multiple arrays (like collection/dashboard movie lists) creates severe performance bottlenecks because it instantiates a new `Intl.Collator` for every comparison. Replacing it with a single, shared `Intl.Collator` instance reduces sorting time by up to 98% (from ~22s down to ~400ms for 500 iterations of 1000 items).
**Action:** Always instantiate a shared `new Intl.Collator(...)` (e.g., `baseCollator` in `src/utils/helpers.ts`) and use its `.compare()` method when alphabetizing strings in render-critical paths or large data transformations, instead of using `.localeCompare` directly on strings.
