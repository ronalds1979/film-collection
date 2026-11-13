import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { isValidRetailBarcode, recognizeBarcode } from './ocr.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

process.env.DATABASE_URL ??= `file:${path.join(projectRoot, 'film_catalog.db')}`;

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3000);
const uploadsDir = path.join(projectRoot, 'apps/web/public/uploads');
const distDir = path.join(projectRoot, 'apps/web/dist');

const genreOptions = [
  { id: 'GEN01', name: 'Action' },
  { id: 'GEN02', name: 'Adventure' },
  { id: 'GEN03', name: 'Animation' },
  { id: 'GEN04', name: 'Comedy' },
  { id: 'GEN05', name: 'Crime' },
  { id: 'GEN06', name: 'Documentary' },
  { id: 'GEN07', name: 'Drama' },
  { id: 'GEN08', name: 'Fantasy' },
  { id: 'GEN09', name: 'Science Fiction' },
  { id: 'GEN10', name: 'Horror' },
  { id: 'GEN11', name: 'Musical' },
  { id: 'GEN12', name: 'Romance' },
  { id: 'GEN13', name: 'Thriller' },
  { id: 'GEN14', name: 'War' },
  { id: 'GEN15', name: 'Western' },
  { id: 'GEN16', name: 'Biography' },
  { id: 'GEN17', name: 'History' },
  { id: 'GEN18', name: 'Family' },
];

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadsDir),
  filename: (_req, file, callback) => {
    // 🛡️ Sentinel: Restrict uploaded file extensions to safe image formats to prevent stored XSS (.html/.svg)
    const rawExtension = path.extname(file.originalname).toLowerCase();
    const extension = ALLOWED_UPLOAD_EXTENSIONS.has(rawExtension) ? rawExtension : '.jpg';
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    callback(null, `${Date.now()}-${randomSuffix}${extension}`);
  },
});

const imageFileFilter = (_req, file, callback) => {
  if (file.mimetype.startsWith('image/')) {
    callback(null, true);
    return;
  }
  callback(new Error('Only image files are allowed for cover uploads.'));
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// ⚡ Bolt: Keep barcode scans in memory to avoid disk write -> read -> unlink overhead
const barcodeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const normalize = (value) => (typeof value === 'string' ? value.trim() : value ?? '');
const optionalNumber = (value) => (
  value === undefined || value === null || value === '' ? null : Number(value)
);
const isSafeHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
let genreSeedPromise;
const seedGenres = () => {
  if (!genreSeedPromise) {
    genreSeedPromise = prisma.$transaction(
      genreOptions.map(({ id, name }) => prisma.genre.upsert({
        where: { id },
        update: { name },
        create: { id, name },
      })),
    ).catch((error) => {
      genreSeedPromise = undefined;
      throw error;
    });
  }
  return genreSeedPromise;
};
const parseGenreIds = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    return null;
  }
  return [...new Set(value)];
};

const toTmdbResult = (item) => ({
  id: item.id,
  title: item.title || item.name || 'Untitled',
  original_title: item.original_title || item.originalTitle || null,
  originalTitle: item.original_title || item.originalTitle || null,
  release_date: item.release_date || item.first_air_date || null,
  releaseDate: item.release_date || item.first_air_date || null,
  overview: item.overview || item.synopsis || '',
  poster_path: item.poster_path || null,
  backdrop_path: item.backdrop_path || null,
  imdb_id: item.imdb_id || null,
  source: 'tmdb',
});

const allowedCorsOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedCorsOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS policy.'));
  },
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_MAX_TRACKED_IPS = 1000;

const createRateLimiter = ({ windowMs = RATE_LIMIT_WINDOW_MS, maxRequests = RATE_LIMIT_MAX_REQUESTS } = {}) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
      if (hits.size >= RATE_LIMIT_MAX_TRACKED_IPS) {
        for (const [trackedKey, trackedEntry] of hits) {
          if (now >= trackedEntry.resetAt) hits.delete(trackedKey);
        }
        if (hits.size >= RATE_LIMIT_MAX_TRACKED_IPS) {
          const oldestKey = hits.keys().next().value;
          if (oldestKey !== undefined) hits.delete(oldestKey);
        }
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ success: false, message: 'Too many requests. Please try again shortly.' });
      return;
    }

    next();
  };
};

const heavyEndpointLimiter = createRateLimiter();

app.use(express.json({ limit: '2mb' }));
// ⚡ Bolt: Cover filenames include timestamp + random hex, so they are immutable and safely cacheable
app.use('/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'film-collection-api' });
});

// ⚡ Bolt: Reuse a single Intl.Collator instead of calling String.prototype.localeCompare in loops
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

app.get('/api/summary', async (_req, res, next) => {
  try {
    // ⚡ Bolt: Compute all dashboard counts in a single SQLite round-trip instead of 4 separate queries
    const [summary] = await prisma.$queryRaw`
      SELECT
        COUNT(*) AS totalMovies,
        COALESCE(SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END), 0) AS favorites,
        COALESCE(SUM(CASE WHEN watchedStatus = 'unwatched' THEN 1 ELSE 0 END), 0) AS unwatched,
        (SELECT COUNT(*) FROM Edition) AS totalEditions
      FROM Movie
    `;

    res.json({
      totalMovies: Number(summary?.totalMovies ?? 0),
      totalEditions: Number(summary?.totalEditions ?? 0),
      favorites: Number(summary?.favorites ?? 0),
      unwatched: Number(summary?.unwatched ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

// ⚡ Bolt: Cache static genre list in memory and allow browser caching to skip repeated SQLite reads
let cachedGenres = null;

app.get('/api/genres', async (_req, res) => {
  try {
    if (!cachedGenres) {
      await seedGenres();
      cachedGenres = await prisma.genre.findMany({ orderBy: { id: 'asc' } });
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(cachedGenres);
  } catch (error) {
    console.error('Failed to load film genres.', error);
    res.status(500).json({ message: 'Unable to load film genres.' });
  }
});

app.get('/api/movies', async (req, res, next) => {
  try {
    const rawLimit = req.query.limit;
    const limit = rawLimit !== undefined ? Number(rawLimit) : null;
    if (limit !== null && Number.isSafeInteger(limit) && limit > 0) {
      const safeLimit = Math.min(limit, 1000);
      // ⚡ Bolt: Lightweight bounded query for Dashboard "Movies A-Z" without joining editions/genres
      const movies = await prisma.$queryRaw`
        SELECT id, title, alternativeTitle, releaseYear, watchedStatus
        FROM Movie
        ORDER BY COALESCE(NULLIF(alternativeTitle, ''), title) COLLATE NOCASE ASC
        LIMIT ${safeLimit}
      `;
      res.json(movies);
      return;
    }

    const movies = await prisma.movie.findMany({
      include: { editions: true, genres: true },
      orderBy: { title: 'asc' },
    });
    res.json(movies);
  } catch (error) {
    next(error);
  }
});

// ⚡ Bolt: Single-movie endpoint avoids loading the entire catalog on edit page open
app.get('/api/movies/:id', async (req, res, next) => {
  const movieId = Number(req.params.id);
  if (!Number.isSafeInteger(movieId) || movieId < 1) {
    return res.status(400).json({ message: 'A valid movie ID is required.' });
  }

  try {
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      include: { editions: true, genres: true },
    });
    if (!movie) {
      return res.status(404).json({ message: 'This movie was not found in the collection.' });
    }
    res.json(movie);
  } catch (error) {
    next(error);
  }
});

app.get('/api/editions', async (_req, res, next) => {
  try {
    const editions = await prisma.edition.findMany({
      include: { movie: true },
      orderBy: [{ movie: { title: 'asc' } }, { editionYear: 'asc' }, { id: 'asc' }],
    });
    res.json(editions);
  } catch (error) {
    next(error);
  }
});

app.get('/api/export', async (_req, res, next) => {
  try {
    const movies = await prisma.movie.findMany({
      include: { editions: true, genres: true },
      orderBy: { title: 'asc' },
    });

    res.setHeader('Content-Disposition', 'attachment; filename="film-collection-export.json"');
    res.json({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      currency: 'EUR',
      movies,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/upload-cover', heavyEndpointLimiter, upload.single('image'), async (req, res) => {
  const slot = String(req.body.slot || '');
  if (!req.file || !['front', 'back'].includes(slot)) {
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch((error) => {
        console.error('Failed to remove cover with invalid slot', error instanceof Error ? error.name : 'Unknown error');
      });
    }

    res.status(400).json({ success: false, message: 'A cover image and a front/back slot are required.' });
    return;
  }

  const normalizedFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  const normalizedPath = path.join(uploadsDir, normalizedFilename);
  try {
    // 🛡️ Sentinel: Always re-encode uploaded covers via Sharp to strip EXIF/GPS metadata
    await sharp(req.file.path, { failOn: 'error' })
      .rotate()
      .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
      .toFile(normalizedPath);
    await fs.promises.unlink(req.file.path);

    res.status(201).json({
      success: true,
      file: {
        slot,
        filename: normalizedFilename,
        path: `/uploads/${normalizedFilename}`,
      },
    });
  } catch (error) {
    await Promise.all([
      fs.promises.unlink(req.file.path).catch((cleanupError) => {
        console.error('Failed to remove original cover upload', cleanupError instanceof Error ? cleanupError.name : 'Unknown error');
      }),
      fs.promises.unlink(normalizedPath).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Failed to remove incomplete normalized cover', cleanupError instanceof Error ? cleanupError.name : 'Unknown error');
        }
      }),
    ]);
    console.error('Cover image normalization failed', error instanceof Error ? error.message : 'Unknown error');
    res.status(415).json({
      success: false,
      message: `The ${slot} camera photo could not be prepared as a standard image. Choose a JPEG photo or change the camera setting to JPEG/Most Compatible and capture it again.`,
    });
  }
});

app.post('/api/barcode/read', heavyEndpointLimiter, barcodeUpload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Choose or capture an image containing a barcode.' });
    return;
  }

  try {
    const scan = await recognizeBarcode(req.file.buffer);
    if (!scan.barcode) {
      res.json({
        success: true,
        found: false,
        message: 'No supported barcode was read. Try a close, sharp photo of the barcode, or enter its digits manually.',
      });
      return;
    }

    res.json({
      success: true,
      found: true,
      barcode: scan.barcode,
      format: scan.barcodeFormat,
      source: scan.barcodeSource,
      validated: isValidRetailBarcode(scan.barcode),
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    const diagnostic = error instanceof Error
      ? { name: error.name, code: error.code || null, message: error.message }
      : { name: 'UnknownError', code: null, message: String(error) };
    console.error('Barcode read failed', { requestId, ...diagnostic });
    res.status(500).json({
      success: false,
      requestId,
      message: `Barcode processing failed. Try another image or enter the barcode manually. If it repeats, report reference ${requestId}.`,
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed', error);
  const status = error instanceof multer.MulterError ? 400 : (error.status || 500);
  res.status(status).json({ success: false, message: 'The request could not be processed.' });
});

app.post('/api/ingest', async (req, res, next) => {
  try {
    const payload = req.body || {};
    const title = normalize(payload.title);
    if (!title) {
      res.status(400).json({ message: 'A movie title is required.' });
      return;
    }

    const genreIds = payload.genreIds === undefined ? [] : parseGenreIds(payload.genreIds);
    if (!genreIds) {
      res.status(400).json({ message: 'genreIds must be an array of genre identifiers.' });
      return;
    }
    await seedGenres();
    if (genreIds.length > 0) {
      const knownGenres = await prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } });
      if (knownGenres.length !== genreIds.length) {
        res.status(400).json({ message: 'One or more selected genres are not recognized.' });
        return;
      }
    }

    const integerFields = [
      ['releaseYear', 'Release year'],
      ['durationMinutes', 'Duration'],
      ['personalRating', 'Personal rating'],
      ['editionYear', 'Edition year'],
      ['discCount', 'Disc count'],
    ];
    for (const [field, label] of integerFields) {
      const value = payload[field];
      if (value !== undefined && value !== null && value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
        res.status(400).json({ message: `${label} must be a non-negative whole number.` });
        return;
      }
    }

    for (const [field, label] of [['purchasePrice', 'Purchase price'], ['estimatedValue', 'Estimated value']]) {
      const value = payload[field];
      if (value !== undefined && value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        res.status(400).json({ message: `${label} must be a non-negative amount.` });
        return;
      }
    }

    const identifierFields = [
      'countryId',
      'originalLanguageId',
      'formatId',
      'editionTypeId',
      'movieVersionId',
      'distributorId',
      'countryEditionId',
      'locationId',
      'collectionId',
    ];
    for (const field of identifierFields) {
      const value = payload[field];
      if (value !== undefined && value !== null && value !== '' && typeof value !== 'string') {
        res.status(400).json({ message: `${field} must be a text identifier.` });
        return;
      }
    }

    const booleanFields = ['favorite', 'rewatchFlag', 'steelbook', 'slipcover', 'digibook', 'booklet', 'posterIncluded'];
    for (const field of booleanFields) {
      const value = payload[field];
      if (value !== undefined && typeof value !== 'boolean') {
        res.status(400).json({ message: `${field} must be a boolean value.` });
        return;
      }
    }

    // 🛡️ Sentinel: Validate cover paths on ingest to prevent path traversal or arbitrary URL injection
    for (const field of ['frontCoverPath', 'backCoverPath', 'spineImagePath']) {
      const value = payload[field];
      if (value !== undefined && value !== null && value !== '' && (typeof value !== 'string' || !/^\/uploads\/[^/\\]+$/.test(value))) {
        res.status(400).json({ message: `${field} must reference an uploaded cover image.` });
        return;
      }
    }

    // 🛡️ Sentinel: Validate external URLs to block javascript: or data: URI injection
    for (const field of ['imdbUrl', 'tmdbUrl', 'posterPath']) {
      const value = normalize(payload[field]);
      if (value && !(isSafeHttpUrl(value) || (field === 'posterPath' && /^\/uploads\/[^/\\]+$/.test(value)))) {
        res.status(400).json({ message: `${field} must be a valid HTTP/HTTPS URL.` });
        return;
      }
    }

    const { movie, edition } = await prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.create({
        data: {
        title,
        originalTitle: normalize(payload.originalTitle) || null,
        alternativeTitle: normalize(payload.alternativeTitle) || null,
        releaseYear: optionalNumber(payload.releaseYear),
        releaseDate: normalize(payload.releaseDate) || null,
        countryId: normalize(payload.countryId) || null,
        durationMinutes: optionalNumber(payload.durationMinutes),
        synopsis: normalize(payload.synopsis) || null,
        originalLanguageId: normalize(payload.originalLanguageId) || null,
        ageRating: normalize(payload.ageRating) || null,
        personalRating: optionalNumber(payload.personalRating),
        favorite: Boolean(payload.favorite),
        watchedStatus: normalize(payload.watchedStatus) || 'unwatched',
        watchedDate: normalize(payload.watchedDate) || null,
        rewatchFlag: Boolean(payload.rewatchFlag),
        notes: normalize(payload.notes) || null,
        posterPath: normalize(payload.posterPath) || null,
        imdbId: normalize(payload.imdbId) || null,
        tmdbId: normalize(payload.tmdbId) || null,
        imdbUrl: normalize(payload.imdbUrl) || null,
        tmdbUrl: normalize(payload.tmdbUrl) || null,
        genres: { connect: genreIds.map((id) => ({ id })) },
        },
      });

      const edition = await transaction.edition.create({
        data: {
        movieId: movie.id,
        formatId: normalize(payload.formatId) || null,
        editionTypeId: normalize(payload.editionTypeId) || null,
        movieVersionId: normalize(payload.movieVersionId) || null,
        distributorId: normalize(payload.distributorId) || null,
        countryEditionId: normalize(payload.countryEditionId) || null,
        editionYear: optionalNumber(payload.editionYear),
        region: normalize(payload.region) || null,
        barcode: normalize(payload.barcode) || null,
        catalogNumber: normalize(payload.catalogNumber) || null,
        steelbook: Boolean(payload.steelbook),
        slipcover: Boolean(payload.slipcover),
        digibook: Boolean(payload.digibook),
        booklet: Boolean(payload.booklet),
        posterIncluded: Boolean(payload.posterIncluded),
        discCount: optionalNumber(payload.discCount),
        condition: normalize(payload.condition) || null,
        purchaseDate: normalize(payload.purchaseDate) || null,
        purchasePrice: optionalNumber(payload.purchasePrice),
        estimatedValue: optionalNumber(payload.estimatedValue),
        locationId: normalize(payload.locationId) || null,
        collectionId: normalize(payload.collectionId) || null,
        frontCoverPath: normalize(payload.frontCoverPath) || null,
        backCoverPath: normalize(payload.backCoverPath) || null,
        spineImagePath: normalize(payload.spineImagePath) || null,
        notes: normalize(payload.editionNotes) || null,
        },
      });

      return { movie, edition };
    });

    res.status(201).json({
      message: 'Movie cataloged successfully.',
      movie,
      edition,
      workflow: {
        stage: 'user-confirmation',
        status: 'Awaiting final user confirmation before storage is considered complete.',
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/movies/:id', async (req, res, next) => {
  try {
    const movieId = Number(req.params.id);
    const payload = req.body || {};
    const editionId = Number(payload.editionId);
    const title = normalize(payload.title);

    if (!Number.isSafeInteger(movieId) || movieId < 1 || !Number.isSafeInteger(editionId) || editionId < 1) {
      res.status(400).json({ message: 'A valid movie and edition are required.' });
      return;
    }
    if (!title) {
      res.status(400).json({ message: 'A movie title is required.' });
      return;
    }
    const genreIds = parseGenreIds(payload.genreIds);
    if (payload.genreIds !== undefined && !genreIds) {
      res.status(400).json({ message: 'genreIds must be an array of genre identifiers.' });
      return;
    }

    const integerFields = [
      ['releaseYear', 'Release year'],
    ['editionYear', 'Edition year'],
    ['discCount', 'Disc count'],
  ];
  for (const [field, label] of integerFields) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
      res.status(400).json({ message: `${label} must be a non-negative whole number.` });
      return;
    }
  }

  for (const [field, label] of [['purchasePrice', 'Purchase price'], ['estimatedValue', 'Estimated value']]) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      res.status(400).json({ message: `${label} must be a non-negative amount.` });
      return;
    }
  }

  const identifierFields = [
    'countryId',
    'originalLanguageId',
    'formatId',
    'editionTypeId',
    'movieVersionId',
    'distributorId',
    'countryEditionId',
    'locationId',
    'collectionId',
  ];
  for (const field of identifierFields) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== '' && typeof value !== 'string') {
      res.status(400).json({ message: `${field} must be a text identifier.` });
      return;
    }
  }

  const textFields = [
    'title',
    'originalTitle',
    'alternativeTitle',
    'releaseDate',
    'ageRating',
    'synopsis',
    'notes',
    'watchedStatus',
    'watchedDate',
    'imdbId',
    'tmdbId',
    'imdbUrl',
    'tmdbUrl',
    'posterPath',
    'region',
    'barcode',
    'catalogNumber',
    'condition',
    'editionNotes',
  ];
  for (const field of textFields) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== '' && typeof value !== 'string') {
      res.status(400).json({ message: `${field} must be text.` });
      return;
    }
  }

  const booleanFields = ['favorite', 'steelbook', 'slipcover', 'digibook', 'booklet', 'posterIncluded'];
  for (const field of booleanFields) {
    const value = payload[field];
    if (value !== undefined && typeof value !== 'boolean') {
      res.status(400).json({ message: `${field} must be a boolean value.` });
      return;
    }
  }

    for (const field of ['frontCoverPath', 'backCoverPath']) {
      const value = payload[field];
      if (value !== undefined && value !== null && (typeof value !== 'string' || !/^\/uploads\/[^/\\]+$/.test(value))) {
        res.status(400).json({ message: `${field} must reference an uploaded cover image.` });
        return;
      }
    }

    for (const field of ['imdbUrl', 'tmdbUrl', 'posterPath']) {
      const value = normalize(payload[field]);
      if (value && !(isSafeHttpUrl(value) || (field === 'posterPath' && /^\/uploads\/[^/\\]+$/.test(value)))) {
        res.status(400).json({ message: `${field} must be a valid HTTP/HTTPS URL.` });
        return;
      }
    }

    // ⚡ Bolt: Run validation queries concurrently and select only required columns
    const [, knownGenres, existingMovie, existingEdition] = await Promise.all([
      seedGenres(),
      genreIds && genreIds.length > 0
        ? prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } })
        : Promise.resolve(null),
      prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } }),
      prisma.edition.findFirst({
        where: { id: editionId, movieId },
        select: { id: true, frontCoverPath: true, backCoverPath: true },
      }),
    ]);

    if (knownGenres && knownGenres.length !== genreIds.length) {
      res.status(400).json({ message: 'One or more selected genres are not recognized.' });
      return;
    }
    if (!existingMovie) {
      res.status(404).json({ message: 'Movie not found.' });
      return;
    }
    if (!existingEdition) {
      res.status(404).json({ message: 'The selected edition does not belong to this movie.' });
      return;
    }

    const movieData = {
      title,
      originalTitle: normalize(payload.originalTitle) || null,
      alternativeTitle: normalize(payload.alternativeTitle) || null,
      releaseYear: optionalNumber(payload.releaseYear),
      releaseDate: normalize(payload.releaseDate) || null,
      countryId: normalize(payload.countryId) || null,
      originalLanguageId: normalize(payload.originalLanguageId) || null,
      ageRating: normalize(payload.ageRating) || null,
      synopsis: normalize(payload.synopsis) || null,
      notes: normalize(payload.notes) || null,
      favorite: Boolean(payload.favorite),
      watchedStatus: normalize(payload.watchedStatus) || 'unwatched',
      watchedDate: normalize(payload.watchedDate) || null,
      imdbId: normalize(payload.imdbId) || null,
      tmdbId: normalize(payload.tmdbId) || null,
      imdbUrl: normalize(payload.imdbUrl) || null,
      tmdbUrl: normalize(payload.tmdbUrl) || null,
      posterPath: normalize(payload.posterPath) || null,
      ...(genreIds ? { genres: { set: genreIds.map((id) => ({ id })) } } : {}),
    };
    const editionData = {
      formatId: normalize(payload.formatId) || null,
      editionTypeId: normalize(payload.editionTypeId) || null,
      movieVersionId: normalize(payload.movieVersionId) || null,
      distributorId: normalize(payload.distributorId) || null,
      countryEditionId: normalize(payload.countryEditionId) || null,
      editionYear: optionalNumber(payload.editionYear),
      region: normalize(payload.region) || null,
      barcode: normalize(payload.barcode) || null,
      catalogNumber: normalize(payload.catalogNumber) || null,
      steelbook: Boolean(payload.steelbook),
      slipcover: Boolean(payload.slipcover),
      digibook: Boolean(payload.digibook),
      booklet: Boolean(payload.booklet),
      posterIncluded: Boolean(payload.posterIncluded),
      discCount: optionalNumber(payload.discCount),
      condition: normalize(payload.condition) || null,
      purchasePrice: optionalNumber(payload.purchasePrice),
      estimatedValue: optionalNumber(payload.estimatedValue),
      locationId: normalize(payload.locationId) || null,
      collectionId: normalize(payload.collectionId) || null,
      notes: normalize(payload.editionNotes) || null,
      ...(payload.frontCoverPath !== undefined ? { frontCoverPath: normalize(payload.frontCoverPath) || null } : {}),
      ...(payload.backCoverPath !== undefined ? { backCoverPath: normalize(payload.backCoverPath) || null } : {}),
    };

    const result = await prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.update({ where: { id: movieId }, data: movieData });
      const edition = await transaction.edition.update({
        where: { id: editionId },
        data: editionData,
      });
      return { movie, edition };
    });

    res.json({ message: 'Movie and edition updated successfully.', ...result });
  } catch (error) {
    next(error);
  }
});

const lookupMetadata = async (query) => {
  const tmdbReadAccessToken = process.env.TMDB_READ_ACCESS_TOKEN || '';
  const tmdbApiKey = process.env.TMDB_API_KEY || '';
  const omdbApiKey = process.env.OMDB_API_KEY || process.env.IMDB_API_KEY || '';

  // ⚡ Bolt: Fetch TMDb and OMDb metadata in parallel instead of sequentially
  const fetchTmdb = async () => {
    if (!tmdbReadAccessToken && !tmdbApiKey) return { results: [], failed: false };
    try {
      const tmdbUrl = new URL('https://api.themoviedb.org/3/search/movie');
      tmdbUrl.searchParams.set('query', query);

      const headers = { accept: 'application/json' };
      if (tmdbReadAccessToken) {
        headers.authorization = `Bearer ${tmdbReadAccessToken}`;
      } else {
        tmdbUrl.searchParams.set('api_key', tmdbApiKey);
      }

      // 🛡️ Sentinel: Enforce 8s timeout on external metadata requests to prevent hanging connections
      const response = await fetch(tmdbUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        throw new Error(`TMDb returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      const items = [];
      if (Array.isArray(data.results)) {
        for (const item of data.results) {
          items.push(toTmdbResult(item));
        }
      }
      return { results: items, failed: false };
    } catch (error) {
      console.error('TMDb search failed', error instanceof Error ? error.name : 'Unknown error');
      return { results: [], failed: true };
    }
  };

  const fetchOmdb = async () => {
    if (!omdbApiKey) return { results: [], failed: false };
    try {
      const response = await fetch(`https://www.omdbapi.com/?apikey=${omdbApiKey}&s=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`OMDb returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      const items = [];
      if (Array.isArray(data.Search)) {
        for (const item of data.Search) {
          items.push({
            title: item.Title,
            originalTitle: item.Title,
            release_date: item.Year || null,
            releaseDate: item.Year || null,
            overview: item.Plot || item.Type || '',
            poster_path: item.Poster || null,
            imdb_id: item.imdbID || null,
            source: 'imdb',
          });
        }
      }
      return { results: items, failed: false };
    } catch (error) {
      console.error('OMDb search failed', error instanceof Error ? error.name : 'Unknown error');
      return { results: [], failed: true };
    }
  };

  const [tmdbOutcome, omdbOutcome] = await Promise.all([fetchTmdb(), fetchOmdb()]);
  const results = [...tmdbOutcome.results, ...omdbOutcome.results];
  const failedProviders = [];
  if (tmdbOutcome.failed) failedProviders.push('tmdb');
  if (omdbOutcome.failed) failedProviders.push('imdb');

  if (!results.length) {
    if (failedProviders.length) {
      return {
        status: 502,
        payload: {
          message: 'Metadata provider search failed. Check the configured API credentials and try again.',
          providers: failedProviders,
          results: [],
        },
      };
    }

    if (!tmdbReadAccessToken && !tmdbApiKey && !omdbApiKey) {
      return {
        status: 503,
        payload: {
          message: 'No metadata provider is configured. Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in .env.',
          results: [],
        },
      };
    }

    return { status: 200, payload: { provider: 'none', results: [] } };
  }

  return {
    status: 200,
    payload: {
      provider: results.some((item) => item.source === 'tmdb') ? 'tmdb+imdb' : 'imdb',
      results,
    },
  };
};

app.get('/api/search', async (req, res, next) => {
  try {
    const query = String(req.query.query || '').trim();
    if (!query || query.length > 200) {
      return res.status(400).json({ message: 'A movie title search query (1-200 characters) is required.' });
    }

    const lookup = await lookupMetadata(query);
    return res.status(lookup.status).json(lookup.payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/metadata/barcode', async (req, res, next) => {
  try {
    const barcode = String(req.query.barcode || '').replace(/\s/g, '');
    if (!isValidRetailBarcode(barcode)) {
      return res.status(400).json({
        message: 'Enter a valid EAN/UPC barcode before searching for metadata.',
        results: [],
      });
    }

    const editions = await prisma.edition.findMany({
      where: { barcode },
      include: { movie: true },
      orderBy: { id: 'asc' },
    });
    const catalogMovies = Array.from(new Map(editions.map(({ movie }) => [movie.id, movie])).values());

    if (catalogMovies.length) {
      const catalogResults = catalogMovies.map((movie) => ({
        id: /^\d+$/.test(movie.tmdbId || '') ? Number(movie.tmdbId) : undefined,
        movieId: movie.id,
        tmdbId: movie.tmdbId,
        tmdbUrl: movie.tmdbUrl,
        title: movie.title,
        original_title: movie.originalTitle,
        originalTitle: movie.originalTitle,
        release_date: movie.releaseDate || (movie.releaseYear ? String(movie.releaseYear) : null),
        releaseDate: movie.releaseDate || (movie.releaseYear ? String(movie.releaseYear) : null),
        overview: movie.synopsis || '',
        poster_path: movie.posterPath,
        imdb_id: movie.imdbId,
        source: 'catalog',
      }));

      const liveLookups = await Promise.all(catalogMovies.map((movie) => lookupMetadata(movie.title)));
      const liveResults = liveLookups
        .filter((lookup) => lookup.status === 200)
        .flatMap((lookup) => lookup.payload.results);
      // ⚡ Bolt: O(1) Set lookup for TMDb IDs and shared Intl.Collator for title deduplication
      const catalogIds = new Set(catalogResults.map((catalog) => catalog.id).filter(Boolean));
      const results = [
        ...catalogResults,
        ...liveResults.filter((live) => (
          !(live.id && catalogIds.has(live.id))
          && !catalogResults.some((catalog) => titleCollator.compare(live.title, catalog.title) === 0)
        )),
      ];

      return res.json({
        success: true,
        barcode,
        source: liveResults.length ? 'catalog+live-metadata' : 'catalog',
        message: `Barcode matched ${catalogMovies.length} catalog title${catalogMovies.length === 1 ? '' : 's'}${liveResults.length ? ' and live metadata was added' : ''}.`,
        results,
      });
    }

    const productUrl = new URL('https://api.upcitemdb.com/prod/trial/lookup');
    productUrl.searchParams.set('upc', barcode);
    const productResponse = await fetch(productUrl, { signal: AbortSignal.timeout(8000) });
    if (!productResponse.ok) {
      throw new Error(`UPCItemDB returned HTTP ${productResponse.status}.`);
    }

    const productData = await productResponse.json();
    const product = Array.isArray(productData.items) ? productData.items[0] : null;
    if (!product?.title) {
      return res.json({
        success: true,
        barcode,
        source: 'upcitemdb',
        message: 'The barcode is not in the local catalog and the product lookup returned no title. Search by the movie title instead.',
        results: [],
      });
    }

    const metadata = await lookupMetadata(product.title);
    const productResult = {
      title: product.title,
      originalTitle: product.title,
      overview: product.description || '',
      poster_path: Array.isArray(product.images) ? product.images[0] || null : null,
      source: 'upcitemdb',
    };
    const results = metadata.status === 200 && metadata.payload.results.length
      ? metadata.payload.results
      : [productResult];

    return res.json({
      success: true,
      barcode,
      source: metadata.status === 200 && metadata.payload.results.length ? 'upcitemdb+live-metadata' : 'upcitemdb',
      message: `Barcode product match: ${product.title}. Review the title and metadata before applying.`,
      results,
    });
  } catch (error) {
    console.error('Barcode metadata lookup failed', error instanceof Error ? error.name : 'Unknown error');
    if (error instanceof Error && error.message.includes('returned HTTP')) {
      return res.status(502).json({
        message: 'Barcode metadata lookup is temporarily unavailable. You can still search by movie title.',
        results: [],
      });
    }
    next(error);
  }
});

const distIndexPath = path.join(distDir, 'index.html');

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }

  // ⚡ Bolt: Avoid synchronous fs.existsSync blocking the event loop on every SPA route
  res.sendFile(distIndexPath, (error) => {
    if (error) {
      res.send('Film collection backend is running. Build the frontend before serving static assets.');
    }
  });
});

async function start() {
  await prisma.$connect();
  await seedGenres();

  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`Film collection API listening on http://${host}:${port}`);
  });
}

export { app };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch((error) => {
    console.error('Failed to start the film collection API.', error);
    process.exit(1);
  });
}
