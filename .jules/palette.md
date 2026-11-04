## 2024-10-26 - Accessible Clear Button for Search
**Learning:** Custom Material UI TextFields acting as search inputs lack the native 'clear' (x) functionality of type='search' inputs. This forces users to manually backspace through their queries, which is poor UX for all users and particularly painful for keyboard/assistive tech users.
**Action:** Always add an accessible `endAdornment` with an `IconButton` (with an `aria-label`) to custom search TextFields to restore this expected interaction pattern.
## 2024-11-04 - Actionable Empty States
**Learning:** Empty states resulting from active filters or search queries (like "No movies match these filters") are frustrating when they are static text. Users have to manually undo their filter selections to recover.
**Action:** Always include an actionable, one-click "Clear filters" button directly within the empty state message to allow users to easily reset their view and recover from over-filtering.
