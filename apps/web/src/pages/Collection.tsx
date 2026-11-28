import { memo, useCallback, useEffect, useState, useMemo, useRef, useDeferredValue } from 'react';
import { Box, Button, Card, CardActionArea, CardContent, CardMedia, Chip, CircularProgress, Container, FormControl, InputAdornment, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, Alert, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import ClearRounded from '@mui/icons-material/ClearRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Movie, Genre, Edition } from '../types';
import { API_BASE, baseCollator } from '../utils/helpers';
import { formatLabel, watchedOptions } from '../utils/constants';

function getEmptyStateCopy(collectionView: string, hasActiveFilters?: boolean): { message: string; showAddCta: boolean } {
  if (hasActiveFilters) {
    return { message: 'No catalog entries match these filters.', showAddCta: false };
  }
  if (collectionView === 'favorites') {
    return { message: 'You have no favorite movies yet. Mark a movie as Favorite when adding or editing an entry.', showAddCta: true };
  }
  if (collectionView === 'unwatched') {
    return { message: 'You have no unwatched movies in your collection.', showAddCta: true };
  }
  return { message: 'Your film collection is empty. Start by cataloging your first physical edition.', showAddCta: true };
}

// ⚡ Bolt: Memoize individual mobile cards (matching CollectionTableRow) so "Show more" pagination
// and filter updates reuse unchanged card subtrees instead of re-rendering all visible cards.
const CollectionMobileCard = memo(function CollectionMobileCard({ movie, edition, onSelect }: {
  movie: Movie;
  edition?: Edition;
  onSelect: (movie: Movie, edition?: Edition) => void;
}) {
  const displayTitle = movie.alternativeTitle || movie.title;
  const subtitle = [movie.title, movie.originalTitle].filter(Boolean).join(' · ') || 'Movie title unavailable';
  const genreNames = movie._genresText ?? (movie.genres || []).map((genre) => genre.name).join(', ');

  return (
    <Card sx={{ overflow: 'hidden', background: 'rgba(18,28,46,0.96)' }}>
      <CardActionArea
        onClick={() => onSelect(movie, edition)}
        aria-label={`Edit details for ${displayTitle}${edition ? ` (${formatLabel(edition.formatId)})` : ''}`}
        sx={{ textAlign: 'left' }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                {displayTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>
                {subtitle}
              </Typography>
            </Box>
            {movie.favorite && <Chip size="small" color="secondary" label="Favorite" />}
          </Stack>
          <Stack spacing={0.75} sx={{ mt: 1.5 }}>
            <Typography variant="body2">
              {movie.releaseYear || 'Year unavailable'} · {movie.watchedStatus || 'unwatched'}
              {movie.watchedDate ? ` · Watched: ${movie.watchedDate}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {genreNames || 'No genre'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {edition
                ? `${formatLabel(edition.formatId)}${edition.editionYear ? ` · ${edition.editionYear}` : ''}${edition.barcode ? ` · ${edition.barcode}` : ''}`
                : 'No physical edition'}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.5} sx={{ mt: 1.5, color: 'primary.main' }}>
            <EditRounded fontSize="small" />
            <Typography variant="button" sx={{ fontSize: '0.8125rem' }}>
              Edit details
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
});

const CollectionMobileCards = memo(function CollectionMobileCards({ rows, isLoading, loadError, onRetry, onSelect, hasActiveFilters, onClearFilters, collectionView }: {
  rows: Array<{ movie: Movie; edition?: Edition }>;
  isLoading: boolean;
  loadError: string | null;
  onRetry?: () => void;
  onSelect: (movie: Movie, edition?: Edition) => void;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  collectionView?: string;
}) {
  if (isLoading) {
    return (
      <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ display: { xs: 'flex', md: 'none' }, py: 5 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading your collection...</Typography>
      </Stack>
    );
  }

  if (loadError) {
    return (
      <Alert
        severity="error"
        sx={{ display: { xs: 'flex', md: 'none' } }}
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      >
        {loadError}
      </Alert>
    );
  }

  if (!rows.length) {
    const emptyCopy = getEmptyStateCopy(collectionView || 'movies', hasActiveFilters);
    return (
      <Paper sx={{ display: { xs: 'block', md: 'none' }, p: 3, textAlign: 'center', borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
        <Typography color="text.secondary" sx={{ mb: hasActiveFilters || emptyCopy.showAddCta ? 2 : 0 }}>{emptyCopy.message}</Typography>
        {hasActiveFilters && (
          <Button variant="outlined" size="small" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        {!hasActiveFilters && emptyCopy.showAddCta && (
          <Button component={RouterLink} to="/add-movie" variant="contained" size="small" sx={{ mt: 2 }}>
            Add movie
          </Button>
        )}
      </Paper>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }} aria-label="Collection movie list">
      {rows.map(({ movie, edition }) => (
        <CollectionMobileCard
          key={`${movie.id}-${edition?.id || 'movie'}`}
          movie={movie}
          edition={edition}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  );
});

const MoviePosterCard = memo(function MoviePosterCard({ movie, onSelect }: {
  movie: Movie;
  onSelect: (movie: Movie) => void;
}) {
  const coverPath = movie.editions?.find((edition) => edition.frontCoverPath)?.frontCoverPath;
  const primaryImage = coverPath || movie.posterPath || '';
  const fallbackImage = coverPath && movie.posterPath && coverPath !== movie.posterPath ? movie.posterPath : '';
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);

  const imageUrl = erroredSrc === primaryImage
    ? fallbackImage
    : (fallbackImage && erroredSrc === fallbackImage ? '' : primaryImage);

  return (
    <Card
      role="listitem"
      sx={{
        width: { xs: 150, sm: 180 },
        minWidth: { xs: 150, sm: 180 },
        flexShrink: 0,
        overflow: 'hidden',
        scrollSnapAlign: 'start',
        background: '#101b2d',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        '&:hover, &:focus-within': { transform: 'scale(1.04)', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover, &:focus-within': { transform: 'none' },
        },
      }}
    >
      <Button
        onClick={() => onSelect(movie)}
        aria-label={`Open details for ${movie.alternativeTitle || movie.title}`}
        sx={{
          display: 'block',
          width: '100%',
          p: 0,
          textAlign: 'left',
          color: 'inherit',
          '&:hover': { background: 'transparent' },
          '&:focus-visible': { outline: '2px solid #8ab4ff', outlineOffset: -2 },
        }}
      >
        {imageUrl ? (
          <CardMedia
            component="img"
            image={imageUrl}
            alt={`${movie.alternativeTitle || movie.title} cover`}
            loading="lazy"
            decoding="async"
            onError={() => {
              if (fallbackImage && imageUrl === primaryImage) setErroredSrc(primaryImage);
              else if (imageUrl) setErroredSrc(imageUrl);
            }}
            sx={{ aspectRatio: '2 / 3', objectFit: 'cover', background: 'rgba(255,255,255,0.04)' }}
          />
        ) : (
          <Box
            sx={{
              aspectRatio: '2 / 3',
              display: 'grid',
              placeItems: 'center',
              p: 2,
              textAlign: 'center',
              color: 'text.secondary',
              background: 'linear-gradient(145deg, rgba(138,180,255,0.18), rgba(18,28,46,0.9))',
            }}
          >
            <Typography variant="h6" fontWeight={700}>{movie.alternativeTitle || movie.title}</Typography>
          </Box>
        )}
        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.5 } }}>
          <Tooltip title={movie.alternativeTitle || movie.title}>
            <Typography fontWeight={700} noWrap>
              {movie.alternativeTitle || movie.title}
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" noWrap>
            {movie.releaseYear || 'Year unavailable'} · {(movie._genresText ?? movie.genres?.map((genre) => genre.name).join(', ')) || 'Unclassified'}
          </Typography>
        </CardContent>
      </Button>
    </Card>
  );
});

const INITIAL_CAROUSEL_ITEMS = 14;

const MovieCarouselRow = memo(function MovieCarouselRow({ genre, movies, onSelect }: {
  genre: Genre;
  movies: Movie[];
  onSelect: (movie: Movie) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [renderedCount, setRenderedCount] = useState(INITIAL_CAROUSEL_ITEMS);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    setRenderedCount(INITIAL_CAROUSEL_ITEMS);
  }, [movies]);

  const visibleMovies = useMemo(
    () => movies.slice(0, renderedCount),
    [movies, renderedCount],
  );

  const updateScrollBounds = () => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollBounds();
    window.addEventListener('resize', updateScrollBounds);
    return () => window.removeEventListener('resize', updateScrollBounds);
  }, [visibleMovies.length]);

  const loadMoreIfNeeded = () => {
    if (renderedCount < movies.length) {
      setRenderedCount((prev) => Math.min(prev + INITIAL_CAROUSEL_ITEMS, movies.length));
    }
  };

  const scrollBehavior = (): ScrollBehavior => (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
  );

  return (
    <Paper
      sx={{
        p: { xs: 1.5, sm: 2.5 },
        borderRadius: 3,
        background: 'rgba(18,28,46,0.9)',
        // ⚡ Bolt: Skip layout/paint for off-screen genre shelves
        contentVisibility: 'auto',
        containIntrinsicSize: '0 340px',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" component="h2" fontWeight={700}>{genre.name}</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={movies.length}
            aria-label={`${movies.length} ${movies.length === 1 ? 'movie' : 'movies'}`}
          />
        </Stack>
        <Stack direction="row">
          <Tooltip title="Scroll left">
            <span>
              <IconButton
                aria-label={`Scroll ${genre.name} movies left`}
                disabled={!canScrollLeft}
                onClick={() => carouselRef.current?.scrollBy({ left: -420, behavior: scrollBehavior() })}
              >
                <ChevronLeftRounded />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Scroll right">
            <span>
              <IconButton
                aria-label={`Scroll ${genre.name} movies right`}
                disabled={!canScrollRight}
                onClick={() => {
                  loadMoreIfNeeded();
                  carouselRef.current?.scrollBy({ left: 420, behavior: scrollBehavior() });
                }}
              >
                <ChevronRightRounded />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
      <Box
        ref={carouselRef}
        role="list"
        aria-label={`${genre.name} movies`}
        onScroll={(event) => {
          const el = event.currentTarget;
          updateScrollBounds();
          if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 400) {
            loadMoreIfNeeded();
          }
        }}
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          scrollBehavior: 'smooth',
          scrollSnapType: 'x mandatory',
          pb: 1,
          '&::-webkit-scrollbar': { height: 8 },
          '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(138,180,255,0.35)', borderRadius: 4 },
        }}
      >
        {visibleMovies.map((movie) => (
          <MoviePosterCard key={movie.id} movie={movie} onSelect={onSelect} />
        ))}
      </Box>
    </Paper>
  );
});

const CollectionTableRow = memo(function CollectionTableRow({ movie, edition, onSelect }: {
  movie: Movie;
  edition?: Edition;
  onSelect: (movie: Movie, edition?: Edition) => void;
}) {
  const displayTitle = movie.alternativeTitle || movie.title;
  const status = movie.watchedStatus || 'unwatched';
  const formattedStatus = `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  const statusLabel = movie.favorite ? `Favorite · ${formattedStatus}` : formattedStatus;
  const genreNames = movie._genresText ?? (movie.genres || []).map((genre) => genre.name).join(', ');

  return (
    <TableRow
      hover
      onClick={() => onSelect(movie, edition)}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell>
        <Typography fontWeight={700}>{displayTitle}</Typography>
        <Typography variant="caption" color="text.secondary">
          {[movie.title, movie.originalTitle].filter(Boolean).join(' · ') || 'Movie title unavailable'}
        </Typography>
      </TableCell>
      <TableCell>{genreNames || '—'}</TableCell>
      <TableCell>{movie.releaseYear || '—'}</TableCell>
      <TableCell>{edition ? `${formatLabel(edition.formatId)} · ${edition.editionYear || 'Year n/a'}` : 'No edition'}</TableCell>
      <TableCell sx={{ fontFamily: edition?.barcode ? 'monospace' : undefined }}>{edition?.barcode || '—'}</TableCell>
      <TableCell>
        {statusLabel}
        {movie.watchedDate ? ` · ${movie.watchedDate}` : ''}
      </TableCell>
      <TableCell align="right">
        <Button
          size="small"
          startIcon={<EditRounded />}
          aria-label={`Edit ${displayTitle}${edition ? ` (${formatLabel(edition.formatId)})` : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(movie, edition);
          }}
        >
          Edit
        </Button>
      </TableCell>
    </TableRow>
  );
});

// ⚡ Bolt: Memoize desktop table so synchronous searchTerm keystrokes don't re-render all visible MUI TableRows
const CollectionTable = memo(function CollectionTable({ rows, isLoading, loadError, onRetry, onSelect, hasActiveFilters, onClearFilters, collectionView }: {
  rows: Array<{ movie: Movie; edition?: Edition }>;
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onSelect: (movie: Movie, edition?: Edition) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  collectionView: string;
}) {
  return (
    <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
      <Table aria-label="Collection movies table">
        <TableHead>
          <TableRow>
            <TableCell>Movie</TableCell>
            <TableCell>Genre</TableCell>
            <TableCell>Year</TableCell>
            <TableCell>Edition</TableCell>
            <TableCell>Barcode</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} align="center">
                <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} role="status" aria-live="polite">
                  <CircularProgress size={18} />
                  <span>Loading your collection...</span>
                </Stack>
              </TableCell>
            </TableRow>
          )}
          {loadError && (
            <TableRow>
              <TableCell colSpan={7}>
                <Alert
                  severity="error"
                  action={
                    <Button color="inherit" size="small" onClick={onRetry}>
                      Retry
                    </Button>
                  }
                >
                  {loadError}
                </Alert>
              </TableCell>
            </TableRow>
          )}
          {rows.map(({ movie, edition }) => (
            <CollectionTableRow
              key={`${movie.id}-${edition?.id || 'movie'}`}
              movie={movie}
              edition={edition}
              onSelect={onSelect}
            />
          ))}
          {!isLoading && !loadError && !rows.length && (() => {
            const emptyCopy = getEmptyStateCopy(collectionView, hasActiveFilters);
            return (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary" sx={{ mb: hasActiveFilters || emptyCopy.showAddCta ? 2 : 0 }}>{emptyCopy.message}</Typography>
                  {hasActiveFilters && (
                    <Button variant="outlined" size="small" onClick={onClearFilters}>
                      Clear filters
                    </Button>
                  )}
                  {!hasActiveFilters && emptyCopy.showAddCta && (
                    <Button component={RouterLink} to="/add-movie" variant="contained" size="small">
                      Add movie
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })()}
        </TableBody>
      </Table>
    </TableContainer>
  );
});

const COLLECTION_PAGE_SIZE = 60;

// ⚡ Bolt: Memoize filter dropdowns and display-mode toggle so synchronous searchTerm keystrokes
// skip re-rendering 3 MUI Select trees (~27 MenuItems) and mode buttons on every character typed.
const CollectionFilterControls = memo(function CollectionFilterControls({
  statusFilter,
  genreFilter,
  collectionView,
  displayMode,
  genres,
  onStatusChange,
  onGenreChange,
  onViewChange,
  onDisplayTable,
  onDisplayCarousel,
}: {
  statusFilter: string;
  genreFilter: string;
  collectionView: string;
  displayMode: 'table' | 'carousel';
  genres: Genre[];
  onStatusChange: (event: SelectChangeEvent<string>) => void;
  onGenreChange: (event: SelectChangeEvent<string>) => void;
  onViewChange: (event: SelectChangeEvent<string>) => void;
  onDisplayTable: () => void;
  onDisplayCarousel: () => void;
}) {
  return (
    <>
      <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }}>
        <InputLabel id="collection-status-label">Watched status</InputLabel>
        <Select labelId="collection-status-label" id="collection-status-select" label="Watched status" value={statusFilter} onChange={onStatusChange}>
          <MenuItem value="all">All</MenuItem>
          {watchedOptions.map((option) => (
            <MenuItem key={option} value={option}>{option}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }} disabled={!genres.length}>
        <InputLabel id="collection-genre-label">Genre</InputLabel>
        <Select labelId="collection-genre-label" id="collection-genre-select" label="Genre" value={genreFilter} onChange={onGenreChange}>
          <MenuItem value="all">All genres</MenuItem>
          {genres.map((genre) => (
            <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }}>
        <InputLabel id="collection-view-label">Show</InputLabel>
        <Select
          labelId="collection-view-label"
          id="collection-view-select"
          label="Show"
          value={collectionView}
          onChange={onViewChange}
        >
          <MenuItem value="movies">Movies</MenuItem>
          <MenuItem value="editions">Editions</MenuItem>
          <MenuItem value="favorites">Favorites</MenuItem>
          <MenuItem value="unwatched">Unwatched</MenuItem>
        </Select>
      </FormControl>
      {collectionView !== 'editions' && (
        <Stack direction="row" spacing={1} role="group" aria-label="Display mode" sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
          <Button
            variant={displayMode === 'table' ? 'contained' : 'outlined'}
            onClick={onDisplayTable}
            aria-pressed={displayMode === 'table'}
            sx={{ flex: 1 }}
          >
            List
          </Button>
          <Button
            variant={displayMode === 'carousel' ? 'contained' : 'outlined'}
            onClick={onDisplayCarousel}
            aria-pressed={displayMode === 'carousel'}
            sx={{ flex: 1 }}
          >
            Posters
          </Button>
        </Stack>
      )}
    </>
  );
});

export function CollectionPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [genreError, setGenreError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [displayMode, setDisplayMode] = useState<'table' | 'carousel'>('table');
  const [visibleCount, setVisibleCount] = useState(COLLECTION_PAGE_SIZE);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  // ⚡ Bolt: Mount only the active viewport representation (table on md+, cards on <md) instead of rendering both
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const collectionView = searchParams.get('view') || 'movies';

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = Boolean(
        target
        && (target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable),
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === '/' && !isEditable && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    setVisibleCount(COLLECTION_PAGE_SIZE);
  }, [deferredSearchTerm, statusFilter, genreFilter, collectionView, displayMode]);

  const handleSelectRow = useCallback((movie: Movie, edition?: Edition) => {
    navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`);
  }, [navigate]);

  const handleSelectMovie = useCallback((movie: Movie) => {
    navigate(`/edit-movie/${movie.id}${movie.editions?.[0] ? `?editionId=${movie.editions[0].id}` : ''}`);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setGenreError(null);
    const loadMovies = async () => {
      try {
        const response = await fetch(`${API_BASE}/movies?view=summary`);
        if (!response.ok) throw new Error(`The collection could not be loaded (HTTP ${response.status}).`);
        const payload = await response.json() as Movie[];
        if (!Array.isArray(payload)) throw new Error('The collection API returned an invalid response.');
        // ⚡ Bolt: Pre-sort movies/editions and pre-normalize search text once on fetch
        // instead of re-allocating lowercase strings and re-sorting on every filter keystroke.
        const prepared = payload
          .map((movie) => ({
            ...movie,
            editions: movie.editions && movie.editions.length > 1
              ? [...movie.editions].sort((left, right) => (
                (left.editionYear || 0) - (right.editionYear || 0)
                || (left.id || 0) - (right.id || 0)
              ))
              : movie.editions,
            _searchText: [movie.title, movie.originalTitle, movie.alternativeTitle]
              .filter(Boolean)
              .join('\0')
              .toLowerCase(),
            _genresText: (movie.genres || []).map((genre) => genre.name).join(', '),
          }))
          .sort((left, right) => baseCollator.compare(
            left.alternativeTitle || left.title,
            right.alternativeTitle || right.title,
          ));
        if (!cancelled) setMovies(prepared);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'The collection could not be loaded.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadMovies();
    const loadGenres = async () => {
      try {
        const response = await fetch(`${API_BASE}/genres`);
        const payload = await response.json() as Genre[] | { message?: string };
        if (!response.ok) {
          throw new Error(!Array.isArray(payload) ? payload.message || 'Film genres could not be loaded.' : 'Film genres could not be loaded.');
        }
        if (!Array.isArray(payload)) throw new Error('The genre list returned an invalid response.');
        if (!cancelled) setGenres(payload);
      } catch (error) {
        if (!cancelled) setGenreError(error instanceof Error ? error.message : 'Film genres could not be loaded.');
      }
    };
    void loadGenres();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const filteredMovies = useMemo(() => {
    // ⚡ Bolt: Extract loop invariant (string normalization) outside the loop
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

    return movies.filter((movie) => {
      // ⚡ Bolt: Check cheap boolean/enum conditions first to short-circuit
      const matchesStatus = statusFilter === 'all' || movie.watchedStatus === statusFilter;
      if (!matchesStatus) return false;

      const matchesFavorite = collectionView !== 'favorites' || Boolean(movie.favorite);
      if (!matchesFavorite) return false;

      const matchesUnwatched = collectionView !== 'unwatched' || (movie.watchedStatus || 'unwatched') === 'unwatched';
      if (!matchesUnwatched) return false;

      // ⚡ Bolt: Perform cheap title checks against pre-normalized string before the nested genre loop
      if (normalizedSearch) {
        const searchTarget = movie._searchText ?? `${movie.title || ''}\0${movie.originalTitle || ''}\0${movie.alternativeTitle || ''}`.toLowerCase();
        if (!searchTarget.includes(normalizedSearch)) return false;
      }

      let matchesGenre = genreFilter === 'all';
      if (!matchesGenre && movie.genres) {
        for (let i = 0; i < movie.genres.length; i++) {
          if (movie.genres[i].id === genreFilter) {
            matchesGenre = true;
            break;
          }
        }
      }
      if (!matchesGenre) return false;

      return true;
    });
  }, [collectionView, genreFilter, movies, deferredSearchTerm, statusFilter]);

  const isCarouselActive = displayMode === 'carousel' && collectionView !== 'editions';

  const displayedRows = useMemo(() => {
    // ⚡ Bolt: Skip flattening movie/edition rows while carousel view is active
    if (isCarouselActive) {
      return [];
    }
    const rows = [];
    for (let i = 0; i < filteredMovies.length; i++) {
      const movie = filteredMovies[i];
      const editions = movie.editions || [];
      if (collectionView === 'editions') {
        for (let j = 0; j < editions.length; j++) {
          rows.push({ movie, edition: editions[j] });
        }
      } else {
        rows.push({ movie, edition: editions[0] });
      }
    }
    return rows;
  }, [collectionView, filteredMovies, isCarouselActive]);

  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'all' || genreFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setGenreFilter('all');
  }, []);
  const handleRetry = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);
  const handleStatusChange = useCallback((event: SelectChangeEvent<string>) => {
    setStatusFilter(event.target.value);
  }, []);
  const handleGenreChange = useCallback((event: SelectChangeEvent<string>) => {
    setGenreFilter(event.target.value);
  }, []);
  const handleViewChange = useCallback((event: SelectChangeEvent<string>) => {
    const nextView = event.target.value;
    setSearchParams({ view: nextView });
    if (nextView === 'editions') setDisplayMode('table');
  }, [setSearchParams]);
  const handleDisplayTable = useCallback(() => {
    setDisplayMode('table');
  }, []);
  const handleDisplayCarousel = useCallback(() => {
    setDisplayMode('carousel');
  }, []);
  const visibleRows = useMemo(
    () => (isCarouselActive ? [] : displayedRows.slice(0, visibleCount)),
    [displayedRows, isCarouselActive, visibleCount],
  );
  // ⚡ Bolt: Only surface filter-active flag to list views when empty so synchronous search keystrokes
  // ("" -> "a") don't force an immediate 60-row re-render before deferredSearchTerm settles.
  const hasActiveEmptyFilters = visibleRows.length === 0 && hasActiveFilters;

  const carouselShelves = useMemo(() => {
    // ⚡ Bolt: Skip building genre-grouped shelves while table/cards view is active
    if (!isCarouselActive) {
      return [];
    }
    if (genreFilter !== 'all') {
      let selectedGenre = undefined;
      for (let i = 0; i < genres.length; i++) {
        if (genres[i].id === genreFilter) {
          selectedGenre = genres[i];
          break;
        }
      }
      return selectedGenre ? [{ genre: selectedGenre, movies: filteredMovies }] : [];
    }

    // ⚡ Bolt: Replace O(N²) nested loops with O(N) hash map lookup
    const shelves = [];
    const shelfMoviesMap = new Map<string, Movie[]>();

    for (let m = 0; m < filteredMovies.length; m++) {
      const movie = filteredMovies[m];
      if (!movie.genres) continue;

      for (let mg = 0; mg < movie.genres.length; mg++) {
        const genreId = movie.genres[mg].id;
        let shelf = shelfMoviesMap.get(genreId);
        if (!shelf) {
          shelf = [];
          shelfMoviesMap.set(genreId, shelf);
        }
        shelf.push(movie);
      }
    }

    for (let g = 0; g < genres.length; g++) {
      const genre = genres[g];
      const shelfMovies = shelfMoviesMap.get(genre.id);
      if (shelfMovies && shelfMovies.length > 0) {
        shelves.push({ genre, movies: shelfMovies });
      }
    }

    return shelves;
  }, [filteredMovies, genreFilter, genres, isCarouselActive]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>Collection library</Typography>
            <Typography variant="body2" color="text.secondary">
              {displayMode === 'carousel'
                ? 'Browse cover art by genre. Select a movie to open its details.'
                : 'Select a movie row to edit its details and physical edition.'}
            </Typography>
          </Box>
          <Button component="a" href={`${API_BASE}/export`} download="film-collection-export.json" variant="outlined">
            Export catalog JSON
          </Button>
        </Stack>

        <Paper sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
            <TextField
              inputRef={searchInputRef}
              sx={{ flex: { xs: '1 1 100%', md: '1 1 280px' }, minWidth: 0 }}
              label="Search title, original title, or alternative title"
              placeholder="Search titles... (/ or Ctrl+K)"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && searchTerm) {
                  event.preventDefault();
                  setSearchTerm('');
                }
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <Tooltip title="Clear search">
                      <IconButton aria-label="Clear search" onClick={() => setSearchTerm('')} edge="end" size="small">
                        <ClearRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ) : undefined,
              }}
            />
            <CollectionFilterControls
              statusFilter={statusFilter}
              genreFilter={genreFilter}
              collectionView={collectionView}
              displayMode={displayMode}
              genres={genres}
              onStatusChange={handleStatusChange}
              onGenreChange={handleGenreChange}
              onViewChange={handleViewChange}
              onDisplayTable={handleDisplayTable}
              onDisplayCarousel={handleDisplayCarousel}
            />
          </Stack>
          {genreError && (
            <Alert
              severity="warning"
              sx={{ mt: 1.5 }}
              action={
                <Button color="inherit" size="small" onClick={handleRetry}>
                  Retry
                </Button>
              }
            >
              {genreError}
            </Alert>
          )}
          {!isLoading && !loadError && (
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1} sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" role="status" aria-live="polite">
                {collectionView === 'editions'
                  ? `Showing ${visibleRows.length} of ${displayedRows.length} edition${displayedRows.length === 1 ? '' : 's'}${hasActiveFilters ? ' matching filters' : ''}`
                  : displayMode === 'table' && visibleRows.length < filteredMovies.length
                    ? `Showing ${visibleRows.length} of ${filteredMovies.length} matching movies`
                    : `Showing ${filteredMovies.length} of ${movies.length} movie${movies.length === 1 ? '' : 's'}`}
              </Typography>
              {hasActiveFilters && (
                <Button size="small" startIcon={<ClearRounded fontSize="small" />} onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </Stack>
          )}
        </Paper>

        {displayMode === 'carousel' && collectionView !== 'editions' ? (
          <Stack spacing={3} aria-label="Movies by genre">
            {isLoading && (
              <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} role="status" aria-live="polite" sx={{ py: 6 }}>
                <CircularProgress size={20} />
                <Typography color="text.secondary">Loading your collection...</Typography>
              </Stack>
            )}
            {loadError && (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => setReloadToken((n) => n + 1)}>
                    Retry
                  </Button>
                }
              >
                {loadError}
              </Alert>
            )}
            {!isLoading && !loadError && carouselShelves.map(({ genre, movies: shelfMovies }) => (
              <MovieCarouselRow
                key={genre.id}
                genre={genre}
                movies={shelfMovies}
                onSelect={handleSelectMovie}
              />
            ))}
            {!isLoading && !loadError && !carouselShelves.length && (() => {
              const emptyCopy = getEmptyStateCopy(collectionView, hasActiveFilters);
              return (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
                  <Typography color="text.secondary" sx={{ mb: hasActiveFilters || emptyCopy.showAddCta ? 2 : 0 }}>{emptyCopy.message}</Typography>
                  {hasActiveFilters && (
                    <Button variant="outlined" size="small" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                  {!hasActiveFilters && emptyCopy.showAddCta && (
                    <Button component={RouterLink} to="/add-movie" variant="contained" size="small">
                      Add movie
                    </Button>
                  )}
                </Paper>
              );
            })()}
          </Stack>
        ) : (
        <>
          {isDesktop ? (
            <CollectionTable
              rows={visibleRows}
              isLoading={isLoading}
              loadError={loadError}
              onRetry={handleRetry}
              onSelect={handleSelectRow}
              hasActiveFilters={hasActiveEmptyFilters}
              onClearFilters={clearFilters}
              collectionView={collectionView}
            />
          ) : (
            <CollectionMobileCards
              rows={visibleRows}
              isLoading={isLoading}
              loadError={loadError}
              onRetry={handleRetry}
              onSelect={handleSelectRow}
              hasActiveFilters={hasActiveEmptyFilters}
              onClearFilters={clearFilters}
              collectionView={collectionView}
            />
          )}
          {displayedRows.length > visibleCount && (
            <Stack alignItems="center" sx={{ pt: 1 }}>
              <Button variant="outlined" onClick={() => setVisibleCount((prev) => prev + COLLECTION_PAGE_SIZE)}>
                Show more ({displayedRows.length - visibleCount} remaining)
              </Button>
            </Stack>
          )}
        </>
        )}
      </Stack>
    </Container>
  );
}
