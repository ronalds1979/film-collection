# Design & Architecture Review

## 1. Current Architecture
- **Backend**: Express.js REST API handling CRUD operations, image processing (`sharp`), and OCR (`tesseract.js` & `@zxing/library`). Prisma serves as the ORM with a SQLite database.
- **Frontend**: React SPA using Vite, React Router, and Material-UI (MUI). The state is managed locally in components, with `axios` used for API communication.
- **Integration**: External API calls to TMDb and OMDb for movie metadata fetching.

## 2. UX / UI Review
### Strengths:
- Responsive design tailored for mobile scanning use-cases via local network.
- Persistent navigation makes it easy to switch contexts on mobile.
- Clear multi-step intake process.

### Weaknesses / Areas for Improvement:
- **State Management**: Heavy reliance on local component state for complex forms (like `AddMovie.tsx`), which can make components bloated and hard to maintain. Moving form state to a robust library (e.g., React Hook Form) would improve maintainability.
- **Feedback & Error Handling**: While there is basic error handling, providing more granular, non-blocking toast notifications (e.g., using notistack or a custom snackbar context) would improve the UX.
- **Loading States**: Skeletons or improved loading spinners during metadata fetches and image uploads would make the application feel more responsive.
- **UI Consistency**: Ensure all MUI icons use named imports to avoid Vite interop issues (as noted in project constraints).

## 3. Performance Review
### Bottlenecks:
- **Image Processing**: OCR and image resizing (`sharp`) on the Node.js thread can block the event loop for concurrent requests, though this is mitigated by it being a single-user local app.
- **Frontend Rendering**: Large lists in the Collection view might suffer from performance degradation without virtualization if the collection grows significantly.

### Proposed Improvements (The "Bold and Better" Incremental Approach):
1. **Frontend State & Form Overhaul**: Implement `react-hook-form` with `zod` for validation in `AddMovie.tsx` to streamline the complex intake form, reducing re-renders and improving developer experience.
2. **Virtualization**: Introduce `react-window` or `@tanstack/react-virtual` for the Collection list views to ensure smooth scrolling with large catalogs.
3. **Data Fetching Layer**: Replace raw `axios` calls and `useEffect` with `@tanstack/react-query` for improved caching, optimistic updates, and loading state management.
4. **API Optimization**: Implement backend pagination or cursor-based fetching for the collection endpoint to reduce payload sizes on initial load.
5. **UI Polish**: Standardize the theme and introduce skeleton loaders for a smoother perceived performance.

## 4. Proposed First Steps
To begin the incremental improvement process, we should focus on the highest impact, lowest risk areas:
- **Phase 1**: Implement React Query for the Dashboard and Collection pages to instantly improve data fetching performance and caching.
- **Phase 2**: Refactor the `AddMovie` form to use `react-hook-form`.
- **Phase 3**: Implement list virtualization for the Collection page.
