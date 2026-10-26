## 2024-10-26 - Accessible Clear Button for Search
**Learning:** Custom Material UI TextFields acting as search inputs lack the native 'clear' (x) functionality of type='search' inputs. This forces users to manually backspace through their queries, which is poor UX for all users and particularly painful for keyboard/assistive tech users.
**Action:** Always add an accessible `endAdornment` with an `IconButton` (with an `aria-label`) to custom search TextFields to restore this expected interaction pattern.
