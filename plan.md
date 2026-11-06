1. **Identify the UX improvement:**
   - When filtering or searching in the collection view (both `src/pages/Collection.tsx` and `src/App.tsx`), if no results are found, an empty state message is shown (e.g., "No movies match these filters" or "No catalog entries match these filters.").
   - To improve UX, we should add an actionable "Clear filters" button in these empty state messages.
   - This allows users to quickly reset their view in one click without manually clearing the search input and resetting the dropdowns.

2. **Files to modify:**
   - `src/pages/Collection.tsx`
   - `src/App.tsx` (the Collection component code is duplicated here)

3. **Modifications:**
   - In both files, locate the empty state blocks:
     - `CollectionMobileCards` empty state (when `!rows.length`).
     - Carousel empty state (when `!isLoading && !loadError && !carouselShelves.length`).
     - Table empty state (when `!isLoading && !loadError && !displayedRows.length`).
   - For `CollectionMobileCards`, we can't easily clear the parent state, so we might need to pass an `onClearFilters` prop. Wait, `CollectionMobileCards` doesn't know about filters. Maybe we handle it where `CollectionMobileCards` is rendered or pass a prop to it. Let's look at `CollectionMobileCards` usage. Actually, we can add a button right next to the empty state messages.

   - Let's check `src/pages/Collection.tsx`:
     - Empty state 1: Carousel view (`No movies match these filters.`)
     - Empty state 2: Table view (`No catalog entries match these filters.`)
     - Empty state 3: Mobile list view inside `CollectionMobileCards` (`No catalog entries match these filters.`)

   - A better approach for `CollectionMobileCards` might be to pass a `onClearFilters` callback or just update the empty state in the parent where we know about filters. Wait, `CollectionMobileCards` is a separate component. Let's pass a `onClearFilters` prop.

   - Let's add a clear filters function in the main `Collection` component:
     ```tsx
     const handleClearFilters = () => {
       setSearchTerm('');
       setGenreFilter('all');
       setStatusFilter('all');
     };
     ```
     Also if `collectionView` is part of the filtering, maybe we don't clear it, or we navigate to `?view=movies`.
     ```tsx
     const handleClearFilters = () => {
       setSearchTerm('');
       setGenreFilter('all');
       setStatusFilter('all');
       // optionally resetting the view
       // setSearchParams({ view: 'movies' });
     };
     ```

   - Then add a button to the empty states:
     ```tsx
     <Button onClick={handleClearFilters} sx={{ mt: 2 }} variant="outlined">Clear filters</Button>
     ```

4. **Detailed Changes:**
   - In `src/pages/Collection.tsx`:
     - Add `handleClearFilters` function.
     - Update the mobile empty state in `CollectionMobileCards` to accept `onClearFilters?: () => void` and render a button.
     - Pass `onClearFilters={handleClearFilters}` to `CollectionMobileCards`.
     - Update the Carousel empty state to include the button.
     - Update the Table empty state to include the button.
   - Repeat the exact same changes in `src/App.tsx`.

5. **Pre-commit steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Submit PR:**
   - Create PR with format `🎨 Palette: Add 'Clear filters' button to empty states`.
