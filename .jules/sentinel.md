## 2024-05-18 - Fix information leakage via stack traces
**Vulnerability:** Prisma ORM error objects/strings were returned directly to the user in Express API 500 error responses (`error: String(error)`).
**Learning:** Returning unhandled database exceptions leaks internal structure and stack traces, which provides potential avenues for targeted attacks.
**Prevention:** Avoid passing database or application internal errors directly to the client in HTTP responses. Always return generalized error messages for unexpected faults.

## 2024-05-24 - Fix information leakage via internal error messages
**Vulnerability:** Internal error messages (`error.message`) were exposed directly to the client in the global Express fallback error handler.
**Learning:** Returning unhandled generic error messages leaks internal system information (e.g., file paths or system errors) which provides potential avenues for targeted attacks.
**Prevention:** Avoid passing database or application internal error strings directly to the client in HTTP responses. Always return a hardcoded, generalized error message for unexpected faults.

## 2026-11-01 - Fix Denial of Service (DoS) via Unhandled Promise Rejections
**Vulnerability:** Several Express 4 async route handlers lacked `try/catch` blocks (e.g., `/api/summary`, `/api/movies`).
**Learning:** In Express 4, unhandled promise rejections inside async route handlers bypass the global error handler and crash the entire Node.js process, leading to Denial of Service (DoS).
**Prevention:** Always wrap async database operations or async route handlers in `try/catch` blocks and pass the error to `next(error)` so Express can handle it gracefully.

## 2024-06-25 - Fix Denial of Service (DoS) via Unhandled Promise Rejections (continued)
**Vulnerability:** More Express 4 async route handlers lacked `try/catch` blocks (`/api/search`, and its controller `searchMetadata`).
**Learning:** In Express 4, unhandled promise rejections inside async route handlers bypass the global error handler and crash the entire Node.js process, leading to Denial of Service (DoS). While previous fixes addressed some endpoints, others were missed.
**Prevention:** Consistently ensure *all* async route handlers use `try/catch` and `next(error)` in Express 4 applications.

## 2026-11-01 - Fix Denial of Service (DoS) via Unhandled Promise Rejections (continued)
**Vulnerability:** Several Express 4 async route handlers in `server/controllers/movieController.js` (`getSummary`, `getMovies`, `getEditions`, `exportCatalog`) lacked `try/catch` blocks.
**Learning:** In Express 4, unhandled promise rejections inside async route handlers bypass the global error handler and crash the entire Node.js process, leading to Denial of Service (DoS). While previous fixes addressed some endpoints, others were missed.
**Prevention:** Consistently ensure *all* async route handlers use `try/catch` and `next(error)` in Express 4 applications.
## 2026-11-01 - Fix Denial of Service (DoS) via Unhandled Promise Rejections (continued)
**Vulnerability:** Several Express 4 async route handlers in `server/controllers/movieController.js` (`ingestMovie`, `updateMovie`, `getBarcodeMetadata`) and `server/index.js` (`/api/upload-cover`, `/api/barcode/read`) lacked `try/catch` blocks.
**Learning:** In Express 4, unhandled promise rejections inside async route handlers bypass the global error handler and crash the entire Node.js process, leading to Denial of Service (DoS). While previous fixes addressed some endpoints, others were missed.
**Prevention:** Consistently ensure *all* async route handlers use `try/catch` and `next(error)` in Express 4 applications, and when replacing the catch block with `next(error)` ensure that any existing cleanup logic, like file deletion, is preserved.


## 2026-11-17 - Comprehensive Security Hardening (Sentinel Audit Remediation)
**Vulnerabilities Remediated:**
- Bound Vite dev/preview servers to `127.0.0.1` by default (configurable via `VITE_HOST`) so `/api` and `/uploads` proxies are not unintentionally exposed across the LAN on `0.0.0.0`.
- Replaced legacy root `server/*` duplicate modules with thin re-exports pointing to the hardened `@repo/api` (`apps/api/server/*`) modules and updated `benchmark_metadata.js` accordingly.
- Fixed broken Prisma `select` projection (`mediaType`/`editionType` -> `formatId`/`editionTypeId`) in `GET /api/movies?view=summary` resolving the HTTP 500 DoS on Collection load.
- Enforced `requireAuthIfConfigured` on `/uploads` as well as `/api`, checked Prisma reference counts in `cleanupReplacedCoverFiles` before unlinking cover files, and added `cleanupOrphanedUploads()` on server startup.
- Bounded OCR fallback queue depth (`MAX_OCR_QUEUE_DEPTH = 5`) in `apps/api/server/ocr.js` returning HTTP 429 on overload, improved rate-limiter eviction to prefer non-throttled keys, sanitized OMDb `"N/A"` poster values, aligned `movieController.js` pagination and `includeLive` gating, removed unused `axios`, and expanded `.gitignore` for SQLite WAL/SHM and `.env.*` files.
