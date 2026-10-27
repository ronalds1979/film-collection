## 2024-05-18 - Fix information leakage via stack traces
**Vulnerability:** Prisma ORM error objects/strings were returned directly to the user in Express API 500 error responses (`error: String(error)`).
**Learning:** Returning unhandled database exceptions leaks internal structure and stack traces, which provides potential avenues for targeted attacks.
**Prevention:** Avoid passing database or application internal errors directly to the client in HTTP responses. Always return generalized error messages for unexpected faults.

## 2024-05-24 - Fix information leakage via internal error messages
**Vulnerability:** Internal error messages (`error.message`) were exposed directly to the client in the global Express fallback error handler.
**Learning:** Returning unhandled generic error messages leaks internal system information (e.g., file paths or system errors) which provides potential avenues for targeted attacks.
**Prevention:** Avoid passing database or application internal error strings directly to the client in HTTP responses. Always return a hardcoded, generalized error message for unexpected faults.
