import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { ALLOWED_SHARP_FORMATS, isValidRetailBarcode, recognizeBarcode } from './ocr.js';
import { lookupMetadata, readBoundedJson } from './services/metadata.js';
import { ingestMovieSchema, isSafeHttpsUrl, updateMovieSchema } from './schemas/movie.js';
import {
  cleanupOrphanedUploads,
  cleanupReplacedCoverFiles,
  prisma,
  projectRoot,
  resolveUploadFilePath,
  seedGenres,
  uploadsDir,
  verifyUploadedCoversExist,
} from './services/db.js';

const __filename = fileURLToPath(import.meta.url);

// ⚡ Bolt: Enable SQLite WAL mode for concurrent reads and faster writes
prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {});
const app = express();
const port = Number(process.env.PORT || 3000);
const distDir = path.join(projectRoot, 'apps/web/dist');

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'image/heic',
  'image/heif',
]);

const imageFileFilter = (_req, file, callback) => {
  if (ALLOWED_IMAGE_MIME_TYPES.has((file.mimetype || '').toLowerCase())) {
    callback(null, true);
    return;
  }
  const err = new Error('Only raster image files are allowed for cover uploads.');
  err.status = 415;
  callback(err);
};

// ⚡ Bolt: Keep cover uploads in memory to avoid disk write -> read -> unlink overhead
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// ⚡ Bolt: Keep barcode scans in memory to avoid disk write -> read -> unlink overhead
const barcodeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const allowedCorsOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const allowedHostnames = new Set(['127.0.0.1', 'localhost', '[::1]']);
for (const origin of allowedCorsOrigins) {
  try {
    allowedHostnames.add(new URL(origin).hostname.toLowerCase());
  } catch {
    // Ignore malformed CORS origin entries
  }
}
for (const configuredHost of [process.env.HOST, ...(process.env.ALLOWED_HOSTS || '').split(',')]) {
  const normalized = (configuredHost || '').trim().toLowerCase();
  if (normalized && normalized !== '0.0.0.0' && normalized !== '::') {
    allowedHostnames.add(normalized === '::1' ? '[::1]' : normalized);
  }
}

const isAllowedHostHeader = (req) => {
  if (process.env.ALLOW_UNAUTHENTICATED_LAN === 'true') {
    return true;
  }
  const configuredBindHost = (process.env.HOST || '127.0.0.1').trim().toLowerCase();
  if ((process.env.API_AUTH_TOKEN || '').trim() && !LOOPBACK_HOSTS.has(configuredBindHost)) {
    return true;
  }
  let hostHeaderCount = 0;
  for (let i = 0; i < (req.rawHeaders || []).length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === 'host') {
      hostHeaderCount += 1;
      if (hostHeaderCount > 1) return false;
    }
  }
  const rawHost = (req.headers?.host || '').trim().toLowerCase();
  if (!rawHost || /[@\s/\\]/.test(rawHost)) {
    return false;
  }
  try {
    const parsed = new URL(`http://${rawHost}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/') {
      return false;
    }
    return allowedHostnames.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
}

// 🛡️ Sentinel: Enforce local Host header allowlist to block DNS rebinding on unauthenticated loopback servers
app.use((req, res, next) => {
  if (!isAllowedHostHeader(req)) {
    res.status(403).json({ success: false, message: 'Host not allowed.' });
    return;
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedCorsOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    const err = new Error('Origin not allowed by CORS policy.');
    err.status = 403;
    callback(err);
  },
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://image.tmdb.org', 'https://m.media-amazon.com'],
      connectSrc: ["'self'"],
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
          let evictionKey;
          for (const [trackedKey, trackedEntry] of hits) {
            if (trackedEntry.count <= maxRequests) {
              evictionKey = trackedKey;
              break;
            }
          }
          if (evictionKey === undefined) {
            evictionKey = hits.keys().next().value;
          }
          if (evictionKey !== undefined) hits.delete(evictionKey);
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
const globalApiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 300 });
const apiAuthToken = (process.env.API_AUTH_TOKEN || '').trim();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

// 🛡️ Sentinel: Compare fixed-length HMAC-SHA256 digests so timing does not leak API_AUTH_TOKEN length
const timingSafeHmacKey = crypto.randomBytes(32);
const isTimingSafeEqual = (a, b) => {
  const aDigest = crypto.createHmac('sha256', timingSafeHmacKey).update(String(a)).digest();
  const bDigest = crypto.createHmac('sha256', timingSafeHmacKey).update(String(b)).digest();
  return crypto.timingSafeEqual(aDigest, bDigest);
};

const requireAuthIfConfigured = (req, res, next) => {
  if (!apiAuthToken || (req.baseUrl === '/api' && req.path === '/health')) {
    next();
    return;
  }
  const authHeader = req.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedToken = (bearerMatch ? bearerMatch[1] : req.get('x-api-key') || '').trim();
  if (!providedToken || !isTimingSafeEqual(providedToken, apiAuthToken)) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }
  // 🛡️ Sentinel: Prevent shared proxies or browser disk caches from storing authenticated catalog/export responses
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};

app.use('/api', globalApiLimiter);

app.use('/api', requireAuthIfConfigured);

app.use('/api', (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.get('origin');
  const secFetchSite = req.get('sec-fetch-site');

  if (origin) {
    if (!allowedCorsOrigins.has(origin) || secFetchSite === 'cross-site') {
      res.status(403).json({ success: false, message: 'Cross-origin request blocked.' });
      return;
    }
    next();
    return;
  }

  if (secFetchSite && !SAFE_FETCH_SITES.has(secFetchSite)) {
    res.status(403).json({ success: false, message: 'Cross-site request blocked.' });
    return;
  }

  next();
});

app.use(express.json({ limit: '2mb' }));
// ⚡ Bolt: Gzip-compress large JSON/text responses (>1 KB) using built-in zlib
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!/\bgzip\b/i.test(acceptEncoding) || /\bgzip\s*;\s*q=0(?:\.0+)?\b/i.test(acceptEncoding)) {
    next();
    return;
  }
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (res.headersSent || res.writableEnded) {
      return res;
    }
    const serialized = JSON.stringify(body);
    if (serialized.length < 1024) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(serialized);
    }
    zlib.gzip(serialized, (err, compressed) => {
      if (res.headersSent || res.writableEnded) {
        return;
      }
      if (err) {
        origJson(body);
        return;
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(compressed);
    });
    return res;
  };
  next();
});
// ⚡ Bolt: Cover filenames include timestamp + random hex, so they are immutable and safely cacheable
// 🛡️ Sentinel: Rate-limit /uploads, block symlinks and non-JPEG files via lstat, and return 404 JSON on missing covers
const verifySafeStaticUpload = async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(404).json({ success: false, message: 'Uploaded cover not found.' });
    return;
  }
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(req.path || '');
  } catch {
    res.status(404).json({ success: false, message: 'Uploaded cover not found.' });
    return;
  }
  const resolved = resolveUploadFilePath(`/uploads${decodedPath}`);
  if (!resolved || !resolved.toLowerCase().endsWith('.jpg')) {
    res.status(404).json({ success: false, message: 'Uploaded cover not found.' });
    return;
  }
  try {
    const stat = await fs.promises.lstat(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      res.status(404).json({ success: false, message: 'Uploaded cover not found.' });
      return;
    }
  } catch {
    res.status(404).json({ success: false, message: 'Uploaded cover not found.' });
    return;
  }
  next();
};

app.use(
  '/uploads',
  globalApiLimiter,
  requireAuthIfConfigured,
  verifySafeStaticUpload,
  express.static(uploadsDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
      if (apiAuthToken) {
        res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
      }
    },
  }),
  (_req, res) => {
    res.status(404).json({ success: false, message: 'Uploaded cover not found.' });
  },
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'film-collection-api' });
});

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
    res.setHeader('Cache-Control', apiAuthToken ? 'private, max-age=300' : 'public, max-age=300');
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

    const rawOffset = req.query.offset;
    const offset = rawOffset !== undefined ? Math.max(0, Number(rawOffset) || 0) : undefined;
    const take = limit !== null && Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 1000) : undefined;
    const isSummary = req.query.view === 'summary';

    const movies = await prisma.movie.findMany({
      ...(isSummary
        ? {
            select: {
              id: true,
              title: true,
              originalTitle: true,
              alternativeTitle: true,
              releaseYear: true,
              watchedStatus: true,
              favorite: true,
              posterPath: true,
              editions: {
                select: {
                  id: true,
                  editionYear: true,
                  frontCoverPath: true,
                  formatId: true,
                  editionTypeId: true,
                  steelbook: true,
                  slipcover: true,
                  digibook: true,
                  barcode: true,
                },
              },
              genres: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }
        : {
            include: { editions: true, genres: true },
          }),
      orderBy: { title: 'asc' },
      ...(take !== undefined ? { take } : {}),
      ...(offset !== undefined ? { skip: offset } : {}),
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

app.get('/api/editions', async (req, res, next) => {
  try {
    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;
    const limit = rawLimit !== undefined ? Number(rawLimit) : null;
    const take = limit !== null && Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 1000) : undefined;
    const skip = rawOffset !== undefined ? Math.max(0, Number(rawOffset) || 0) : undefined;

    const editions = await prisma.edition.findMany({
      include: { movie: true },
      orderBy: [{ movie: { title: 'asc' } }, { editionYear: 'asc' }, { id: 'asc' }],
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    });
    res.json(editions);
  } catch (error) {
    next(error);
  }
});

app.get('/api/export', heavyEndpointLimiter, async (_req, res, next) => {
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

app.post('/api/upload-cover', heavyEndpointLimiter, upload.single('image'), async (req, res, next) => {
  // 🛡️ Sentinel: Guard optional req.body inside try/catch because multer leaves req.body undefined on non-multipart requests, which would otherwise trigger an Express 4 unhandled rejection crash
  let slot = '';
  let normalizedPath = null;
  try {
    slot = typeof req.body?.slot === 'string' ? req.body.slot : '';
    if (!req.file || !['front', 'back'].includes(slot)) {
      res.status(400).json({ success: false, message: 'A cover image and a front/back slot are required.' });
      return;
    }

    const normalizedFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
    normalizedPath = path.join(uploadsDir, normalizedFilename);
    const meta = await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: 25_000_000 }).metadata();
    if (!meta.format || !ALLOWED_SHARP_FORMATS.has(meta.format)) {
      res.status(415).json({
        success: false,
        message: `The ${slot} file format is not a supported raster image.`,
      });
      return;
    }

    // 🛡️ Sentinel: Always re-encode uploaded covers via Sharp to strip EXIF/GPS metadata
    // ⚡ Bolt: Read directly from memory buffer and cap dimensions/quality for fast decode and smaller payloads
    await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: 25_000_000 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(normalizedPath);

    res.status(201).json({
      success: true,
      file: {
        slot,
        filename: normalizedFilename,
        path: `/uploads/${normalizedFilename}`,
      },
    });
  } catch (error) {
    if (!normalizedPath) {
      next(error);
      return;
    }
    await fs.promises.unlink(normalizedPath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') {
        console.error('Failed to remove incomplete normalized cover', cleanupError instanceof Error ? cleanupError.name : 'Unknown error');
      }
    });
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
    if (error?.status === 429) {
      res.status(429).json({
        success: false,
        message: 'Barcode OCR queue is busy. Please try again shortly.',
      });
      return;
    }
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

app.post('/api/ingest', heavyEndpointLimiter, async (req, res, next) => {
  try {
    const payloadResult = ingestMovieSchema.safeParse(req.body || {});
    if (!payloadResult.success) {
      res.status(400).json({ message: payloadResult.error.errors[0].message, errors: payloadResult.error.errors });
      return;
    }
    const payload = payloadResult.data;

    const coverCheckError = await verifyUploadedCoversExist(payload, ['frontCoverPath', 'backCoverPath', 'spineImagePath', 'posterPath']);
    if (coverCheckError) {
      res.status(400).json({ message: coverCheckError });
      return;
    }

    const genreIds = [...new Set(payload.genreIds || [])];
    await seedGenres();
    if (genreIds.length > 0) {
      const knownGenres = await prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } });
      if (knownGenres.length !== genreIds.length) {
        res.status(400).json({ message: 'One or more selected genres are not recognized.' });
        return;
      }
    }

    const { movie, edition } = await prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.create({
        data: {
        title: payload.title,
        originalTitle: payload.originalTitle || null,
        alternativeTitle: payload.alternativeTitle || null,
        releaseYear: payload.releaseYear ?? null,
        releaseDate: payload.releaseDate || null,
        countryId: payload.countryId || null,
        durationMinutes: payload.durationMinutes ?? null,
        synopsis: payload.synopsis || null,
        originalLanguageId: payload.originalLanguageId || null,
        ageRating: payload.ageRating || null,
        personalRating: payload.personalRating ?? null,
        favorite: Boolean(payload.favorite),
        watchedStatus: payload.watchedStatus || 'unwatched',
        watchedDate: payload.watchedDate || null,
        rewatchFlag: Boolean(payload.rewatchFlag),
        notes: payload.notes || null,
        posterPath: payload.posterPath || null,
        imdbId: payload.imdbId || null,
        tmdbId: payload.tmdbId || null,
        imdbUrl: payload.imdbUrl || null,
        tmdbUrl: payload.tmdbUrl || null,
        genres: { connect: genreIds.map((id) => ({ id })) },
        },
      });

      const edition = await transaction.edition.create({
        data: {
        movieId: movie.id,
        formatId: payload.formatId || null,
        editionTypeId: payload.editionTypeId || null,
        movieVersionId: payload.movieVersionId || null,
        distributorId: payload.distributorId || null,
        countryEditionId: payload.countryEditionId || null,
        editionYear: payload.editionYear ?? null,
        region: payload.region || null,
        barcode: payload.barcode || null,
        catalogNumber: payload.catalogNumber || null,
        steelbook: Boolean(payload.steelbook),
        slipcover: Boolean(payload.slipcover),
        digibook: Boolean(payload.digibook),
        booklet: Boolean(payload.booklet),
        posterIncluded: Boolean(payload.posterIncluded),
        discCount: payload.discCount ?? null,
        condition: payload.condition || null,
        purchaseDate: payload.purchaseDate || null,
        purchasePrice: payload.purchasePrice ?? null,
        estimatedValue: payload.estimatedValue ?? null,
        locationId: payload.locationId || null,
        collectionId: payload.collectionId || null,
        frontCoverPath: payload.frontCoverPath || null,
        backCoverPath: payload.backCoverPath || null,
        spineImagePath: payload.spineImagePath || null,
        notes: payload.editionNotes || null,
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

app.put('/api/movies/:id', heavyEndpointLimiter, async (req, res, next) => {
  try {
    const movieId = Number(req.params.id);
    if (!Number.isSafeInteger(movieId) || movieId < 1) {
      res.status(400).json({ message: 'A valid movie ID is required.' });
      return;
    }

    const payloadResult = updateMovieSchema.safeParse(req.body || {});
    if (!payloadResult.success) {
      res.status(400).json({ message: payloadResult.error.errors[0].message, errors: payloadResult.error.errors });
      return;
    }
    const payload = payloadResult.data;

    const coverCheckError = await verifyUploadedCoversExist(payload, ['frontCoverPath', 'backCoverPath', 'spineImagePath', 'posterPath']);
    if (coverCheckError) {
      res.status(400).json({ message: coverCheckError });
      return;
    }

    const genreIds = [...new Set(payload.genreIds || [])];

    // ⚡ Bolt: Run validation queries concurrently and select only required columns
    const [, knownGenres, existingMovie, existingEdition] = await Promise.all([
      seedGenres(),
      genreIds.length > 0
        ? prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } })
        : Promise.resolve(null),
      prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } }),
      prisma.edition.findFirst({
        where: { id: payload.editionId, movieId },
        select: { id: true, frontCoverPath: true, backCoverPath: true, spineImagePath: true },
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
      title: payload.title,
      originalTitle: payload.originalTitle || null,
      alternativeTitle: payload.alternativeTitle || null,
      releaseYear: payload.releaseYear ?? null,
      releaseDate: payload.releaseDate || null,
      countryId: payload.countryId || null,
      ...(payload.durationMinutes !== undefined ? { durationMinutes: payload.durationMinutes } : {}),
      originalLanguageId: payload.originalLanguageId || null,
      ageRating: payload.ageRating || null,
      ...(payload.personalRating !== undefined ? { personalRating: payload.personalRating } : {}),
      synopsis: payload.synopsis || null,
      notes: payload.notes || null,
      favorite: Boolean(payload.favorite),
      watchedStatus: payload.watchedStatus || 'unwatched',
      watchedDate: payload.watchedDate || null,
      ...(payload.rewatchFlag !== undefined ? { rewatchFlag: Boolean(payload.rewatchFlag) } : {}),
      imdbId: payload.imdbId || null,
      tmdbId: payload.tmdbId || null,
      imdbUrl: payload.imdbUrl || null,
      tmdbUrl: payload.tmdbUrl || null,
      posterPath: payload.posterPath || null,
      genres: { set: genreIds.map((id) => ({ id })) },
    };
    const nextFrontCoverPath = payload.frontCoverPath !== undefined ? (payload.frontCoverPath || null) : existingEdition.frontCoverPath;
    const nextBackCoverPath = payload.backCoverPath !== undefined ? (payload.backCoverPath || null) : existingEdition.backCoverPath;
    const nextSpineImagePath = payload.spineImagePath !== undefined ? (payload.spineImagePath || null) : existingEdition.spineImagePath;
    const editionData = {
      formatId: payload.formatId || null,
      editionTypeId: payload.editionTypeId || null,
      movieVersionId: payload.movieVersionId || null,
      distributorId: payload.distributorId || null,
      countryEditionId: payload.countryEditionId || null,
      editionYear: payload.editionYear ?? null,
      region: payload.region || null,
      barcode: payload.barcode || null,
      catalogNumber: payload.catalogNumber || null,
      steelbook: Boolean(payload.steelbook),
      slipcover: Boolean(payload.slipcover),
      digibook: Boolean(payload.digibook),
      booklet: Boolean(payload.booklet),
      posterIncluded: Boolean(payload.posterIncluded),
      discCount: payload.discCount ?? null,
      condition: payload.condition || null,
      ...(payload.purchaseDate !== undefined ? { purchaseDate: payload.purchaseDate || null } : {}),
      purchasePrice: payload.purchasePrice ?? null,
      estimatedValue: payload.estimatedValue ?? null,
      locationId: payload.locationId || null,
      collectionId: payload.collectionId || null,
      notes: payload.editionNotes || null,
      ...(payload.frontCoverPath !== undefined ? { frontCoverPath: nextFrontCoverPath } : {}),
      ...(payload.backCoverPath !== undefined ? { backCoverPath: nextBackCoverPath } : {}),
      ...(payload.spineImagePath !== undefined ? { spineImagePath: nextSpineImagePath } : {}),
    };

    const result = await prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.update({ where: { id: movieId }, data: movieData });
      const edition = await transaction.edition.update({
        where: { id: payload.editionId },
        data: editionData,
      });
      return { movie, edition };
    });

    const replacedCovers = [];
    if (
      payload.frontCoverPath !== undefined
      && existingEdition.frontCoverPath
      && existingEdition.frontCoverPath !== nextFrontCoverPath
    ) {
      replacedCovers.push(existingEdition.frontCoverPath);
    }
    if (
      payload.backCoverPath !== undefined
      && existingEdition.backCoverPath
      && existingEdition.backCoverPath !== nextBackCoverPath
    ) {
      replacedCovers.push(existingEdition.backCoverPath);
    }
    if (
      payload.spineImagePath !== undefined
      && existingEdition.spineImagePath
      && existingEdition.spineImagePath !== nextSpineImagePath
    ) {
      replacedCovers.push(existingEdition.spineImagePath);
    }
    await cleanupReplacedCoverFiles(replacedCovers);

    res.json({ message: 'Movie and edition updated successfully.', ...result });
  } catch (error) {
    next(error);
  }
});

app.get('/api/search', heavyEndpointLimiter, async (req, res, next) => {
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

// ⚡ Bolt: Bounded LRU+TTL cache for external UPCItemDB barcode lookups
const UPC_CACHE_MAX = 200;
const UPC_CACHE_TTL_MS = 15 * 60 * 1000;
const upcCache = new Map();

const getCachedUpc = (barcode) => {
  const entry = upcCache.get(barcode);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    upcCache.delete(barcode);
    return null;
  }
  upcCache.delete(barcode);
  upcCache.set(barcode, entry);
  return entry.value;
};

const setCachedUpc = (barcode, value) => {
  if (upcCache.has(barcode)) {
    upcCache.delete(barcode);
  } else if (upcCache.size >= UPC_CACHE_MAX) {
    const oldestKey = upcCache.keys().next().value;
    if (oldestKey !== undefined) upcCache.delete(oldestKey);
  }
  upcCache.set(barcode, { value, expiresAt: Date.now() + UPC_CACHE_TTL_MS });
};

app.get('/api/metadata/barcode', heavyEndpointLimiter, async (req, res, next) => {
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

      let results = catalogResults;
      let hasLiveResults = false;
      if (req.query.includeLive === 'true') {
        const liveLookups = await Promise.all(catalogMovies.map((movie) => lookupMetadata(movie.title)));
        const liveResults = liveLookups
          .filter((lookup) => lookup.status === 200)
          .flatMap((lookup) => lookup.payload.results);
        hasLiveResults = liveResults.length > 0;
        // ⚡ Bolt: O(1) Set lookup for both TMDb IDs and normalized titles
        const catalogIds = new Set(catalogResults.map((catalog) => catalog.id).filter(Boolean));
        const catalogTitles = new Set(catalogResults.map((catalog) => (catalog.title || '').trim().toLowerCase()));
        results = [
          ...catalogResults,
          ...liveResults.filter((live) => (
            !(live.id && catalogIds.has(live.id))
            && !catalogTitles.has((live.title || '').trim().toLowerCase())
          )),
        ];
      }

      return res.json({
        success: true,
        barcode,
        source: hasLiveResults ? 'catalog+live-metadata' : 'catalog',
        message: `Barcode matched ${catalogMovies.length} catalog title${catalogMovies.length === 1 ? '' : 's'}${hasLiveResults ? ' and live metadata was added' : ''}.`,
        results,
      });
    }

    let productData = getCachedUpc(barcode);
    if (!productData) {
      const productUrl = new URL('https://api.upcitemdb.com/prod/trial/lookup');
      productUrl.searchParams.set('upc', barcode);
      const productResponse = await fetch(productUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!productResponse.ok) {
        throw new Error(`UPCItemDB returned HTTP ${productResponse.status}.`);
      }

      productData = await readBoundedJson(productResponse);
      setCachedUpc(barcode, productData);
    }
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
    const rawPoster = Array.isArray(product.images) ? product.images[0] : null;
    const productResult = {
      title: product.title,
      originalTitle: product.title,
      overview: product.description || '',
      poster_path: typeof rawPoster === 'string' && isSafeHttpsUrl(rawPoster) ? rawPoster : null,
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

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  console.error('Request failed', error);
  const status = error instanceof multer.MulterError ? 400 : (error.status || 500);
  res.status(status).json({ success: false, message: 'The request could not be processed.' });
});

async function start() {
  const host = process.env.HOST || '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host) && !apiAuthToken && process.env.ALLOW_UNAUTHENTICATED_LAN !== 'true') {
    throw new Error(
      `Refusing to bind to non-loopback host "${host}" without API_AUTH_TOKEN configured. Set API_AUTH_TOKEN or explicitly set ALLOW_UNAUTHENTICATED_LAN=true.`,
    );
  }

  await prisma.$connect();
  await seedGenres();
  cleanupOrphanedUploads().catch(() => {});

  app.listen(port, host, () => {
    console.log(`Film collection API listening on http://${host}:${port}`);
  });
}

export { app, prisma, start };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch((error) => {
    console.error('Failed to start the film collection API.', error);
    process.exit(1);
  });
}
