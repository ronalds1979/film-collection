## Bolt's Journal

## 2024-05-15 - React `useMemo` Loop Invariants and Short-circuit Evaluation in Array Filtering
**Learning:** When filtering large arrays (like movie catalogs) inside a `useMemo` hook, performing string transformations (e.g. `searchTerm.trim().toLowerCase()`) inside the filter callback causes redundant execution for every element, bottlenecking the main thread. Additionally, performing expensive operations like `flatMap` or `.includes()` before checking simple boolean flags bypasses the natural optimization of short-circuit evaluation.
**Action:** Extract loop invariants (such as transformed search strings or normalized boolean state properties) outside the `.filter` or `.map` callbacks. Structure conditional checks to evaluate simple, cheap boolean conditions first (using early returns) and defer expensive string or array traversals to the end of the check so they only run when strictly necessary.
