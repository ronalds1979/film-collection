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

## 2026-11-17 - Follow-up Audit Hardening
**Vulnerabilities Remediated:**
- Restricted `imageFileFilter` in `apps/api/server/index.js` to an explicit raster MIME allowlist and verified Sharp metadata (`ALLOWED_SHARP_FORMATS`) in `/api/upload-cover` and `ocr.js` to block SVG/XML uploads.
- Hardened `isSafeHttpUrl` / added `isSafeHttpsUrl` in `apps/api/server/schemas/movie.js` to reject embedded credentials, loopback, link-local, and RFC1918 private network addresses; validated OMDb and UPCItemDB poster URLs with `isSafeHttpsUrl`.
- Bounded TMDb, OMDb, and UPCItemDB `fetch()` responses with `redirect: 'error'` and streamed size limits (`readBoundedJson`, 2 MB max).
- Centralized `prisma`, `seedGenres`, and cover verification/cleanup helpers in `apps/api/server/services/db.js`, aligned `movieController.js` and `routes/api.js` (including `getMovieById`, `verifyUploadedCoversExist`, and `cleanupReplacedCoverFiles`), and preserved/supported `durationMinutes`, `personalRating`, `rewatchFlag`, `purchaseDate`, and `spineImagePath` in `PUT /api/movies/:id`.
- Set `Cache-Control: private` on `/uploads` when `API_AUTH_TOKEN` is configured and updated `apps/web/public/sw.js` and `public/sw.js` to avoid caching `private`/`no-store` responses; replaced stale root `src/` duplicates with thin re-exports pointing to `apps/web/src/`.

## 2026-11-17 - Schema Contract, Symlink & Metadata Hardening
**Vulnerabilities Remediated:**
- Hardened `isPrivateOrLoopbackHost` in `apps/api/server/schemas/movie.js` to block `.local`/`.internal` hostnames, CGNAT (`100.64.0.0/10`), benchmarking (`198.18.0.0/15`), multicast/reserved IPv4 (`>= 224.0.0.0`), and IPv6 multicast (`ff*::`) while restricting IPv6 prefix checks to addresses containing `:`.
- Restored explicit API validation error messages across `ingestMovieSchema` (`optionalWholeNumber`, `optionalAmount`, `textIdentifier`, `optionalBoolean`, `genreIds`, and `title`) and rejected whitespace-only or boolean inputs in numeric preprocessing.
- Switched `verifyUploadedCoversExist` and `cleanupOrphanedUploads` in `apps/api/server/services/db.js` from `stat` to `lstat` so symbolic links in `uploadsDir` are rejected and never followed.
- Sanitized external TMDb/OMDb `poster_path`, `backdrop_path`, and `imdb_id` values in `apps/api/server/services/metadata.js` and `apps/web/src/pages/AddMovie.tsx` (blocking protocol-relative `//` poster paths and malformed IDs).
- Set `Cache-Control: private, max-age=300` on `/api/genres` when `API_AUTH_TOKEN` is configured, removed unused helpers in `apps/api/server/index.js`, and expanded `tests/controllers/movieController.test.js`.

## 2026-11-20 - IPv6 Hex Normalization Bypass in SSRF Host Validation
**Vulnerability:** `isPrivateOrLoopbackHost` in `apps/api/server/schemas/movie.js` only checked dotted-quad embedded IPv4 suffixes, missing hex-normalized IPv4-compatible IPv6 addresses (`::7f00:1`, `::a9fe:a9fe`, `::ff`), `fe80::/10` (`fe80`–`febf`), and NAT64 (`64:ff9b::/96`).
**Learning:** Node's WHATWG `new URL()` parser normalizes IPv4-compatible IPv6 hosts such as `[::127.0.0.1]` to `[::7f00:1]`, silently bypassing dotted-quad regex checks on `parsed.hostname`.
**Prevention:** Decode compressed two-hextet (`::xxxx:yyyy`) and single-hextet (`::xxxx`) IPv6 hosts back to IPv4 and cover the full `fe80::/10` and `64:ff9b:` ranges in SSRF host validators.

## 2026-11-21 - Unhandled Rejection Crash on Non-Multipart Multer Requests
**Vulnerability:** `POST /api/upload-cover` in `apps/api/server/index.js` read `req.body.slot` before entering its `try/catch` block.
**Learning:** `multer` skips non-`multipart/form-data` requests and `express.json()` skips non-JSON requests, leaving `req.body` as `undefined`; accessing `req.body.slot` outside `try/catch` in an Express 4 `async` handler triggers an unhandled rejection that crashes Node.js.
**Prevention:** Always use optional chaining (`req.body?.field`) and wrap the entire `async` Express 4 route handler body in `try/catch` with `next(error)`.

## 2026-11-22 - FQDN Trailing-Dot Bypass in SSRF Host Validation
**Vulnerability:** `isPrivateOrLoopbackHost` in `apps/api/server/schemas/movie.js` did not strip trailing DNS root dots (`.`) from `parsed.hostname`, allowing `https://localhost./`, `https://127.0.0.1./`, `https://printer.local./`, and `https://metadata.internal./` to bypass SSRF checks.
**Learning:** Node's WHATWG `new URL()` parser preserves trailing dots in `parsed.hostname`, which defeats exact hostname equality, `.local`/`.internal`/`.localhost` suffix checks, and IPv4 regex matching.
**Prevention:** Strip trailing dots (`.replace(/\.+$/, '')`) during host normalization in SSRF validators before matching hostnames or IP patterns.

## 2026-11-24 - IPv6 Transition Tunneling & Site-Local Bypass in SSRF Host Validation
**Vulnerability:** `isPrivateOrLoopbackHost` in `apps/api/server/schemas/movie.js` blocked link-local (`fe80::/10`), ULA (`fc00::/7`), and NAT64 (`64:ff9b::/96`), but permitted 6to4 (`2002::/16`, e.g., `2002:7f00:1::` and `2002:a9fe:a9fe::`), Teredo (`2001::/32`), deprecated site-local (`fec0::/10`), and documentation (`2001:db8::/32`) IPv6 addresses.
**Learning:** IPv6 transition prefixes such as 6to4 encode arbitrary IPv4 addresses (including `127.0.0.1` and `169.254.169.254`) inside non-`::ffff:` hextets, bypassing both dotted-quad and `::xxxx:yyyy` IPv4-compatible decoders.
**Prevention:** Explicitly block IPv6 transition (`2002::/16`, `2001::/32`), site-local (`fec0::/10`), and non-routable documentation (`2001:db8::/32`) ranges alongside `fe80::/10`, `fc00::/7`, and `64:ff9b::/96`.
