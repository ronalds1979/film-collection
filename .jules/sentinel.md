## 2024-10-23 - Information Leakage in API Error Responses
**Vulnerability:** Prisma ORM errors were being serialized as `String(error)` and returned directly to the client in HTTP 500 responses within `ingestMovie` and `updateMovie` controllers.
**Learning:** Returning raw database exception strings directly to the client leaks sensitive backend details such as database structure, query structure, or potentially sensitive data fields. It acts as an information leakage vulnerability.
**Prevention:** Catch exceptions, log them securely on the server side using `console.error`, and return generic, sanitized error messages to the client without exposing the underlying error object or stack traces.
