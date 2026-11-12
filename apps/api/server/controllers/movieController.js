import { prisma, seedGenres } from '../services/db.js';
import { ingestMovieSchema, updateMovieSchema } from '../schemas/movie.js';
import { lookupMetadata } from '../services/metadata.js';
import { isValidRetailBarcode } from '../ocr.js';

// ⚡ Bolt: Reuse a single Intl.Collator and cache static genres in memory
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base' });
let cachedGenres = null;

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

export const getGenres = async (_req, res) => {
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

    const movies = await prisma.movie.findMany({
      include: { editions: true, genres: true },
      orderBy: { title: 'asc' },
    });
    res.json(movies);
  } catch (error) {
    next(error);
  }
};

export const getEditions = async (_req, res, next) => {
  try {
    const editions = await prisma.edition.findMany({
      include: { movie: true },
      orderBy: [{ movie: { title: 'asc' } }, { editionYear: 'asc' }, { id: 'asc' }],
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

export const ingestMovie = async (req, res) => {
  try {
    const payloadResult = ingestMovieSchema.safeParse(req.body);
    if (!payloadResult.success) {
      return res.status(400).json({ message: payloadResult.error.errors[0].message, errors: payloadResult.error.errors });
    }
    const payload = payloadResult.data;

    await seedGenres();

    if (payload.genreIds && payload.genreIds.length > 0) {
      const knownGenres = await prisma.genre.findMany({ where: { id: { in: payload.genreIds } }, select: { id: true } });
      if (knownGenres.length !== payload.genreIds.length) {
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
          genres: payload.genreIds.length ? { connect: payload.genreIds.map((id) => ({ id })) } : undefined,
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
    console.error(error);
    res.status(500).json({ message: 'Unable to ingest movie metadata.' });
  }
};

export const updateMovie = async (req, res) => {
  const movieId = Number(req.params.id);
  if (!Number.isSafeInteger(movieId) || movieId < 1) {
    return res.status(400).json({ message: 'A valid movie ID is required.' });
  }

  try {
    const payloadResult = updateMovieSchema.safeParse(req.body);
    if (!payloadResult.success) {
      return res.status(400).json({ message: payloadResult.error.errors[0].message, errors: payloadResult.error.errors });
    }
    const payload = payloadResult.data;

    // ⚡ Bolt: Run validation queries concurrently and select only required columns
    const genreIds = payload.genreIds;
    const [, knownGenres, existingMovie, existingEdition] = await Promise.all([
      seedGenres(),
      genreIds && genreIds.length > 0
        ? prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } })
        : Promise.resolve(null),
      prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } }),
      prisma.edition.findFirst({
        where: { id: payload.editionId, movieId },
        select: { id: true, frontCoverPath: true, backCoverPath: true },
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
      releaseYear: payload.releaseYear,
      releaseDate: payload.releaseDate || null,
      countryId: payload.countryId || null,
      originalLanguageId: payload.originalLanguageId || null,
      ageRating: payload.ageRating || null,
      synopsis: payload.synopsis || null,
      notes: payload.notes || null,
      favorite: Boolean(payload.favorite),
      watchedStatus: payload.watchedStatus || 'unwatched',
      watchedDate: payload.watchedDate || null,
      imdbId: payload.imdbId || null,
      tmdbId: payload.tmdbId || null,
      imdbUrl: payload.imdbUrl || null,
      tmdbUrl: payload.tmdbUrl || null,
      posterPath: payload.posterPath || null,
      genres: payload.genreIds ? { set: payload.genreIds.map((id) => ({ id })) } : undefined,
    };

    const editionData = {
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
      purchasePrice: payload.purchasePrice,
      estimatedValue: payload.estimatedValue,
      locationId: payload.locationId || null,
      collectionId: payload.collectionId || null,
      notes: payload.editionNotes || null,
      frontCoverPath: payload.frontCoverPath !== undefined ? (payload.frontCoverPath || null) : existingEdition.frontCoverPath,
      backCoverPath: payload.backCoverPath !== undefined ? (payload.backCoverPath || null) : existingEdition.backCoverPath,
    };

    const result = await prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.update({ where: { id: movieId }, data: movieData });
      const edition = await transaction.edition.update({
        where: { id: payload.editionId },
        data: editionData,
      });
      return { movie, edition };
    });

    res.json({ message: 'Movie and edition updated successfully.', ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to update movie metadata.' });
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

export const getBarcodeMetadata = async (req, res) => {
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
    return res.status(502).json({
      message: 'Barcode metadata lookup is temporarily unavailable. You can still search by movie title.',
      results: [],
    });
  }
};
