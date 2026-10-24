# Functional Specification: Film Collection Management System

## 1. Overview
The Film Collection Management System is a single-user, mobile-friendly web application designed for managing physical movie editions on a local network. It allows the user to catalog their physical media through manual entry, barcode scanning, and external metadata integration.

## 2. Core Workflows
### 2.1 Dashboard & Navigation
- **Dashboard**: Provides a high-level summary of the collection, including statistics (e.g., total movies, favorites, unwatched).
- **Navigation**: Persistent bottom navigation bar on mobile (Home, Add Movie, Collection) and top application bar on desktop.

### 2.2 Movie Intake & Editing
The intake process consists of three main steps:
1. **Barcode Scanning / Title Search**:
   - Users can capture a photo of a barcode or select an existing image.
   - The system uses OCR and Zxing to read retail barcodes.
   - Upon a successful read, it looks up metadata via local catalog or external providers (TMDb / OMDb).
   - Alternatively, users can perform a manual title search to fetch metadata.
2. **Cover Capture**:
   - Users can capture or upload images for the front and back covers of the edition.
   - Images are normalized, resized, and saved in JPEG format on the server.
   - Temporary upload-retry state is maintained.
3. **Data Entry & Save**:
   - Users review and edit movie metadata (Title, Release Year, Genres, Synopsis, etc.).
   - Users provide physical edition details (Format, Distributor, Location, Condition, Purchase Date/Price, etc.).
   - Both front and back covers must be uploaded before an edition is saved.
   - System associates the physical edition with the movie entity.

### 2.3 Collection Management
- **Library Views**: Users can view the collection as a list or a poster grid (horizontal carousels grouped by genre).
- **Search & Filtering**: Search by title (original, alternative). Filter by views like Movies, Editions, Favorites, or Unwatched.
- **Backup & Export**: A JSON export feature allows the user to download a portable backup of the metadata.

## 3. Technical Constraints
- The system runs on a Node.js backend using Express and Prisma ORM (SQLite).
- The frontend is built with React, Vite, and Material UI.
- Local network access only; not exposed to the public internet.
