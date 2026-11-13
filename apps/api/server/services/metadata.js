const MAX_CACHE_SIZE = 200;
const CACHE_TTL_MS = 15 * 60 * 1000;
const metadataCache = new Map();

export const clearMetadataCache = () => {
  metadataCache.clear();
};

const setCachedMetadata = (key, value) => {
  if (metadataCache.has(key)) {
    metadataCache.delete(key);
  } else if (metadataCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = metadataCache.keys().next().value;
    if (oldestKey !== undefined) metadataCache.delete(oldestKey);
  }
  metadataCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

export const toTmdbResult = (item) => ({
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

export const lookupMetadata = async (rawQuery) => {
  const query = String(rawQuery || '').trim().slice(0, 200);
  const cacheKey = query.toLowerCase();
  const cachedEntry = metadataCache.get(cacheKey);
  if (cachedEntry) {
    if (Date.now() < cachedEntry.expiresAt) {
      // Refresh LRU order
      metadataCache.delete(cacheKey);
      metadataCache.set(cacheKey, cachedEntry);
      return cachedEntry.value;
    }
    metadataCache.delete(cacheKey);
  }

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
      const omdbUrl = new URL('https://www.omdbapi.com/');
      omdbUrl.searchParams.set('apikey', omdbApiKey);
      omdbUrl.searchParams.set('s', query);
      const response = await fetch(omdbUrl, {
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
      // Do not cache transient 502 provider errors
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

    const response = { status: 200, payload: { provider: 'none', results: [] } };
    setCachedMetadata(cacheKey, response);
    return response;
  }

  const response = {
    status: 200,
    payload: {
      provider: results.some((item) => item.source === 'tmdb') ? 'tmdb+imdb' : 'imdb',
      results,
    },
  };
  setCachedMetadata(cacheKey, response);
  return response;
};
