## 2024-10-26 - Accessible Clear Button for Search
**Learning:** Custom Material UI TextFields acting as search inputs lack the native 'clear' (x) functionality of type='search' inputs. This forces users to manually backspace through their queries, which is poor UX for all users and particularly painful for keyboard/assistive tech users.
**Action:** Always add an accessible `endAdornment` with an `IconButton` (with an `aria-label`) to custom search TextFields to restore this expected interaction pattern.
## 2024-10-26 - Accessible Clear Button for Empty States
**Learning:** Users often face "dead ends" when filtering/searching returns zero results. Having to manually scroll up and clear individual filter dropdowns or backspace through a search query is tedious. Providing a one-click "Clear filters" action inside empty state messages significantly improves the UX of recovering from zero-result views.
**Action:** Always include an actionable `Clear filters` button directly within zero-result empty state messages for list, table, or grid views to allow users to easily reset their application view.
