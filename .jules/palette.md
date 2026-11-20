## 2024-10-26 - Accessible Clear Button for Search
**Learning:** Custom Material UI TextFields acting as search inputs lack the native 'clear' (x) functionality of type='search' inputs. This forces users to manually backspace through their queries, which is poor UX for all users and particularly painful for keyboard/assistive tech users.
**Action:** Always add an accessible `endAdornment` with an `IconButton` (with an `aria-label`) to custom search TextFields to restore this expected interaction pattern.
\n## 2024-10-27 - Tooltips on Icon-Only Buttons\n**Learning:** While `IconButton` elements commonly feature an `aria-label` for screen readers, visual users may not immediately understand the icon's intent without a text label, leading to poorer UX. This app makes heavy use of icon buttons for clearing forms and side-scrolling carousels.\n**Action:** Always wrap icon-only `IconButton` components in a Material UI `<Tooltip>` to provide contextual, accessible visual text on hover or keyboard focus.


## 2026-11-17 - Contextual Empty States, Single-Tab-Stop Rows & Enter-to-Lookup
**Learning:** Generic empty-state copy ("No entries match these filters") when no filters are active leaves first-time users stranded without a primary CTA. Additionally, putting `tabIndex={0}` on a `<TableRow>` that also contains an `Edit` `<Button>` creates duplicate keyboard tab stops per row, and pressing `Enter` in an intake lookup input shouldn't prematurely submit the whole multi-step form.
**Action:** Provide view-specific empty states with a clear CTA button, keep a single descriptive interactive control per table row, surface live `aria-live="polite"` result counts with an inline Clear Filters action, and bind `Enter` in Step 1 lookup fields to trigger metadata lookup instead of form submission.

## 2026-11-17 - Drag-and-Drop Cover Upload, Single-Tab Mobile Cards & Search Shortcuts
**Learning:** Rendering both a clickable `<CardActionArea>` and a separate `<Button>` inside mobile collection cards creates duplicate keyboard tab stops with generic button labels, and load errors without an inline Retry action strand users until they manually reload. Desktop catalog workflows also benefit from drag-and-drop cover zones, `/` or `Ctrl+K` search focus, `Escape` to clear search, step readiness badges, and one-click "Set to today" on watched dates.
**Action:** Consolidate each mobile card into a single accessible `<CardActionArea>` with a descriptive `aria-label`, add inline `Retry` actions to async error alerts, support drag-and-drop in `UploadField`, wire global search keyboard shortcuts, and turn mobile checklist cards into interactive checkboxes with live completion counts.

## 2026-11-20 - Visual Poster Previews in Metadata Search Results
**Learning:** `SearchResult` cards in `AddMovie` displayed only text even when `poster_path` and `source` were already returned by the API, making it harder to distinguish remakes or same-title films before applying metadata.
**Action:** Share `resolvePosterUrl` between metadata result thumbnails and `applyMetadata` so URL validation stays consistent while giving users instant visual confirmation and source context.
