import { cleanupReplacedCoverFiles, prisma, seedGenres, verifyUploadedCoversExist } from '../services/db.js';
import { ingestMovieSchema, isSafeHttpsUrl, updateMovieSchema } from '../schemas/movie.js';
import { lookupMetadata, readBoundedJson } from '../services/metadata.js';
import { isValidRetailBarcode } from '../ocr.js';

// ⚡ Bolt: Cache static genres in memory and bound external UPCItemDB lookups
let cachedGenres = null;

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

export const getHealth = (_req, res) => {
  res.json({ status: 'ok', service: 'film-collection-api' });
};

export const getSummary = async (_req, res, next) => {
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
};

export const getGenres = async (_req, res, next) => {
  try {
    if (!cachedGenres) {
      await seedGenres();
      cachedGenres = await prisma.genre.findMany({ orderBy: { id: 'asc' } });
    }
    res.setHeader('Cache-Control', process.env.API_AUTH_TOKEN?.trim() ? 'private, max-age=300' : 'public, max-age=300');
    res.json(cachedGenres);
  } catch (error) {
    next(error);
  }
};

export const getMovies = async (req, res, next) => {
  try {
    const rawLimit = req.query?.limit;
    const limit = rawLimit !== undefined ? Number(rawLimit) : null;
    if (limit !== null && Number.isSafeInteger(limit) && limit > 0) {
      const safeLimit = Math.min(limit, 1000);
      const movies = await prisma.$queryRaw`
        SELECT id, title, alternativeTitle, releaseYear, watchedStatus
        FROM Movie
        ORDER BY COALESCE(NULLIF(alternativeTitle, ''), title) COLLATE NOCASE ASC
        LIMIT ${safeLimit}
      `;
      res.json(movies);
      return;
    }

    const rawOffset = req.query?.offset;
    const offset = rawOffset !== undefined ? Math.max(0, Number(rawOffset) || 0) : undefined;
    const take = limit !== null && Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 1000) : undefined;
    const isSummary = req.query?.view === 'summary';

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
              genres: { select: { id: true, name: true } },
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
};

export const getMovieById = async (req, res, next) => {
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
    return res.json(movie);
  } catch (error) {
    next(error);
  }
};

export const getEditions = async (req, res, next) => {
  try {
    const rawLimit = req.query?.limit;
    const rawOffset = req.query?.offset;
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
};

export const exportCatalog = async (_req, res, next) => {
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
};

export const ingestMovie = async (req, res, next) => {
  try {
    const payloadResult = ingestMovieSchema.safeParse(req.body || {});
    if (!payloadResult.success) {
      return res.status(400).json({ message: payloadResult.error.errors[0].message, errors: payloadResult.error.errors });
    }
    const payload = payloadResult.data;

    const coverCheckError = await verifyUploadedCoversExist(payload, ['frontCoverPath', 'backCoverPath', 'spineImagePath', 'posterPath']);
    if (coverCheckError) {
      return res.status(400).json({ message: coverCheckError });
    }

    const genreIds = [...new Set(payload.genreIds || [])];
    await seedGenres();

    if (genreIds.length > 0) {
      const knownGenres = await prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } });
      if (knownGenres.length !== genreIds.length) {
        return res.status(400).json({ message: 'One or more selected genres are not recognized.' });
      }
    }

    const { movie, edition } = await prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.create({
        data: {
          title: payload.title,
          originalTitle: payload.originalTitle || null,
          alternativeTitle: payload.alternativeTitle || null,
          releaseYear: payload.releaseYear,
          releaseDate: payload.releaseDate || null,
          countryId: payload.countryId || null,
          durationMinutes: payload.durationMinutes,
          synopsis: payload.synopsis || null,
          originalLanguageId: payload.originalLanguageId || null,
          ageRating: payload.ageRating || null,
          personalRating: payload.personalRating,
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
          genres: genreIds.length ? { connect: genreIds.map((id) => ({ id })) } : undefined,
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
          editionYear: payload.editionYear,
          region: payload.region || null,
          barcode: payload.barcode || null,
          catalogNumber: payload.catalogNumber || null,
          steelbook: Boolean(payload.steelbook),
          slipcover: Boolean(payload.slipcover),
          digibook: Boolean(payload.digibook),
          booklet: Boolean(payload.booklet),
          posterIncluded: Boolean(payload.posterIncluded),
          discCount: payload.discCount,
          condition: payload.condition || null,
          purchaseDate: payload.purchaseDate || null,
          purchasePrice: payload.purchasePrice,
          estimatedValue: payload.estimatedValue,
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
};

export const updateMovie = async (req, res, next) => {
  const movieId = Number(req.params.id);
  if (!Number.isSafeInteger(movieId) || movieId < 1) {
    return res.status(400).json({ message: 'A valid movie ID is required.' });
  }

  try {
    const payloadResult = updateMovieSchema.safeParse(req.body || {});
    if (!payloadResult.success) {
      return res.status(400).json({ message: payloadResult.error.errors[0].message, errors: payloadResult.error.errors });
    }
    const payload = payloadResult.data;

    const coverCheckError = await verifyUploadedCoversExist(payload, ['frontCoverPath', 'backCoverPath', 'spineImagePath', 'posterPath']);
    if (coverCheckError) {
      return res.status(400).json({ message: coverCheckError });
    }

    // ⚡ Bolt: Run validation queries concurrently and select only required columns
    const genreIds = [...new Set(payload.genreIds || [])];
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
      return res.status(400).json({ message: 'One or more selected genres are not recognized.' });
    }
    if (!existingMovie) {
      return res.status(404).json({ message: 'Movie not found.' });
    }
    if (!existingEdition) {
      return res.status(404).json({ message: 'The selected edition does not belong to this movie.' });
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
};

export const searchMetadata = async (req, res, next) => {
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
};

export const getBarcodeMetadata = async (req, res, next) => {
  const barcode = String(req.query.barcode || '').replace(/\s/g, '');
  if (!isValidRetailBarcode(barcode)) {
    return res.status(400).json({
      message: 'Enter a valid EAN/UPC barcode before searching for metadata.',
      results: [],
    });
  }

  try {
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
      if (req.query?.includeLive === 'true') {
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
};
