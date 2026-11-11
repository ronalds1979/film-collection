## 2024-10-26 - Accessible Clear Button for Search
**Learning:** Custom Material UI TextFields acting as search inputs lack the native 'clear' (x) functionality of type='search' inputs. This forces users to manually backspace through their queries, which is poor UX for all users and particularly painful for keyboard/assistive tech users.
**Action:** Always add an accessible `endAdornment` with an `IconButton` (with an `aria-label`) to custom search TextFields to restore this expected interaction pattern.

## 2026-11-11 - Accessible IconButtons
**Learning:** Material UI's `IconButton` components provide an `aria-label` for screen readers, but do not display tooltips for sighted users. This can lead to confusion if the icon is not universally recognizable.
**Action:** Always wrap icon-only `IconButton` components in a `Tooltip` to provide contextual text for all users.
