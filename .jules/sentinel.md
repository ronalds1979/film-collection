## 2024-05-24 - [Information Disclosure via Prisma Error]
**Vulnerability:** API endpoints (`/api/ingest` and `/api/movies/:id`) were returning `error: String(error)` directly to the client in 500 response bodies. This could expose Prisma ORM error objects or strings that contain sensitive backend details like database structure and queries.
**Learning:** Database schema and query implementation details were inadvertently leaked because the full stringified error object was included in the API response rather than being just logged internally.
**Prevention:** Always log full error details internally (e.g., `console.error`) but return generic, safe error messages to clients (e.g., "Unable to update movie metadata."). Do not attach the raw error to the client response.
