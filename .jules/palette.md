## 2024-10-26 - Accessible Clear Button for Search
**Learning:** Custom Material UI TextFields acting as search inputs lack the native 'clear' (x) functionality of type='search' inputs. This forces users to manually backspace through their queries, which is poor UX for all users and particularly painful for keyboard/assistive tech users.
**Action:** Always add an accessible `endAdornment` with an `IconButton` (with an `aria-label`) to custom search TextFields to restore this expected interaction pattern.

## 2026-11-02 - Actionable Empty States for Filters
**Learning:** Users can get stuck or frustrated when a combination of search and dropdown filters results in an empty collection view, especially if it requires them to manually reset each filter to see their data again.
**Action:** Always provide a one-click "Clear filters" button directly within the empty state message when the empty state is caused by active filters.
