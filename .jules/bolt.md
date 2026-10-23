
## 2024-05-18 - Hoist invariant string calculations out of render loop array methods
**Learning:** Found a performance bottleneck in `src/pages/Collection.tsx` where string normalization (`searchTerm.trim().toLowerCase()`) was placed *inside* an `Array.prototype.filter()` loop executed during a `useMemo` hook. This caused O(N) redundant calculations on every keystroke when typing into the search box. For large film collections, this would needlessly re-calculate string methods, increasing frame times and delaying UI updates.
**Action:** When filtering or mapping lists in React components, closely examine the callback functions for invariant values. Hoist any string manipulation, regex initialization, or calculations that do not depend on the iterated element outside the array loop.
