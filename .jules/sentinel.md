## 2024-10-24 - [Information Leakage in API Error Responses]
**Vulnerability:** Raw error strings from Prisma ORM are being sent directly to the client via `String(error)` in `server/controllers/movieController.js`.
**Learning:** This can expose sensitive backend details like database structure and queries, making it easier for an attacker to understand the backend architecture and find further vulnerabilities.
**Prevention:** Do not expose raw error objects or unhandled error messages to the client. Always log the error details on the server and return a generic error message to the client, such as "An error occurred while processing your request."
