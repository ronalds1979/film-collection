## 2026-10-22 - Prevent Error Details Leakage
**Vulnerability:** Internal error details and stack traces were leaked to the client during `ingestMovie` and `updateMovie` HTTP 500 responses.
**Learning:** `String(error)` was included in the JSON responses which could leak internal schema information or stack traces.
**Prevention:** Ensure errors are logged to the console using `console.error` but omit sensitive error strings from client-facing JSON payloads.
