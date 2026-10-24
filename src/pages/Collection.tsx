import { useState, useMemo, useRef, useEffect } from 'react';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, CardMedia, Chip, CircularProgress, Container, FormControl, InputAdornment, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Alert, IconButton } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import SearchIcon from '@mui/icons-material/Search';
import EditRounded from '@mui/icons-material/EditRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Movie, Genre, Edition } from '../types';
import { API_BASE } from '../utils/helpers';
import { formatOptions, watchedOptions } from '../utils/constants';

function formatLabel(formatId?: string | null) {
  return formatOptions.find((option) => option.id === formatId)?.label || formatId || 'Format n/a';
}

function CollectionMobileCards({ rows, isLoading, loadError, onSelect }: {
  rows: Array<{ movie: Movie; edition?: Edition }>;
  isLoading: boolean;
  loadError: string | null;
  onSelect: (movie: Movie, edition?: Edition) => void;
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
    return <Alert severity="error" sx={{ display: { xs: 'flex', md: 'none' } }}>{loadError}</Alert>;
  }

  if (!rows.length) {
    return (
      <Paper sx={{ display: { xs: 'block', md: 'none' }, p: 3, textAlign: 'center', borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
        <Typography color="text.secondary">No catalog entries match these filters.</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }} aria-label="Collection movie list">
      {rows.map(({ movie, edition }) => (
        <Card key={`${movie.id}-${edition?.id || 'movie'}`} sx={{ overflow: 'hidden', background: 'rgba(18,28,46,0.96)' }}>
          <CardActionArea onClick={() => onSelect(movie, edition)} sx={{ textAlign: 'left' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                    {movie.alternativeTitle || movie.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>
                    {[movie.title, movie.originalTitle].filter(Boolean).join(' · ') || 'Movie title unavailable'}
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
                  {(movie.genres || []).map((genre) => genre.name).join(', ') || 'No genre'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {edition
                    ? `${formatLabel(edition.formatId)}${edition.editionYear ? ` · ${edition.editionYear}` : ''}${edition.barcode ? ` · ${edition.barcode}` : ''}`
                    : 'No physical edition'}
                </Typography>
              </Stack>
            </CardContent>
          </CardActionArea>
          <CardActions sx={{ justifyContent: 'flex-end', px: 1.5, pt: 0 }}>
            <Button size="small" startIcon={<EditRounded />} onClick={() => onSelect(movie, edition)}>
              Edit details
            </Button>
          </CardActions>
        </Card>
      ))}
    </Stack>
  );
}

function MoviePosterCard({ movie, onSelect }: {
  movie: Movie;
  onSelect: (movie: Movie) => void;
}) {
  const coverPath = movie.editions?.find((edition) => edition.frontCoverPath)?.frontCoverPath;
  const primaryImage = coverPath || movie.posterPath || '';
  const fallbackImage = coverPath && movie.posterPath && coverPath !== movie.posterPath ? movie.posterPath : '';
  const [imagePath, setImagePath] = useState(primaryImage);

  useEffect(() => {
    setImagePath(primaryImage);
  }, [primaryImage]);

  const imageUrl = imagePath;

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
        '&:hover': { transform: 'scale(1.04)', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' },
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
        }}
      >
        {imageUrl ? (
          <CardMedia
            component="img"
            image={imageUrl}
            alt={`${movie.alternativeTitle || movie.title} cover`}
            onError={() => {
              if (fallbackImage && imagePath !== fallbackImage) setImagePath(fallbackImage);
              else setImagePath('');
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
          <Typography fontWeight={700} noWrap title={movie.alternativeTitle || movie.title}>
            {movie.alternativeTitle || movie.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {movie.releaseYear || 'Year unavailable'} · {movie.genres?.map((genre) => genre.name).join(', ') || 'Unclassified'}
          </Typography>
        </CardContent>
      </Button>
    </Card>
  );
}

function MovieCarouselRow({ genre, movies, onSelect }: {
  genre: Genre;
  movies: Movie[];
  onSelect: (movie: Movie) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const sortedMovies = useMemo(
    () => [...movies].sort((left, right) => (left.alternativeTitle || left.title)
      .localeCompare(right.alternativeTitle || right.title, undefined, { sensitivity: 'base' })),
    [movies],
  );

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight={700}>{genre.name}</Typography>
        <Stack direction="row">
          <IconButton
            aria-label={`Scroll ${genre.name} movies left`}
            onClick={() => carouselRef.current?.scrollBy({ left: -420, behavior: 'smooth' })}
          >
            <ChevronLeftRounded />
          </IconButton>
          <IconButton
            aria-label={`Scroll ${genre.name} movies right`}
            onClick={() => carouselRef.current?.scrollBy({ left: 420, behavior: 'smooth' })}
          >
            <ChevronRightRounded />
          </IconButton>
        </Stack>
      </Stack>
      <Box
        ref={carouselRef}
        role="list"
        aria-label={`${genre.name} movies`}
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
        {sortedMovies.map((movie) => (
          <MoviePosterCard key={movie.id} movie={movie} onSelect={onSelect} />
        ))}
      </Box>
    </Paper>
  );
}

export function CollectionPage() {
  const { data: movies = [], isLoading: isMoviesLoading, error: moviesError } = useQuery<Movie[]>({
    queryKey: ['movies'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/movies`);
      if (!response.ok) throw new Error(`The collection could not be loaded (HTTP ${response.status}).`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error('The collection API returned an invalid response.');
      return payload;
    },
  });

  const { data: genres = [], error: genresError } = useQuery<Genre[]>({
    queryKey: ['genres'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/genres`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(!Array.isArray(payload) && payload.message ? payload.message : 'Film genres could not be loaded.');
      }
      if (!Array.isArray(payload)) throw new Error('The genre list returned an invalid response.');
      return payload;
    },
  });

  const isLoading = isMoviesLoading;
  const loadError = moviesError instanceof Error ? moviesError.message : null;
  const genreError = genresError instanceof Error ? genresError.message : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [displayMode, setDisplayMode] = useState<'table' | 'carousel'>('table');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const collectionView = searchParams.get('view') || 'movies';

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: displayedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 73,
    overscan: 10,
  });



  const filteredMovies = useMemo(() => movies.filter((movie) => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch = !normalizedSearch || [
        movie.title,
        movie.originalTitle,
        movie.alternativeTitle,
        movie.notes,
        ...(movie.editions || []).flatMap((edition) => [edition.barcode, edition.catalogNumber, edition.distributorId]),
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === 'all' || movie.watchedStatus === statusFilter;
      const matchesFavorite = collectionView !== 'favorites' || Boolean(movie.favorite);
      const matchesUnwatched = collectionView !== 'unwatched' || (movie.watchedStatus || 'unwatched') === 'unwatched';
      const matchesGenre = genreFilter === 'all' || movie.genres?.some((genre) => genre.id === genreFilter) === true;
      return matchesSearch && matchesStatus && matchesFavorite && matchesUnwatched && matchesGenre;
    }), [collectionView, genreFilter, movies, searchTerm, statusFilter]);

  const displayedRows = useMemo(() => filteredMovies.flatMap((movie) => {
    const editions = movie.editions || [];
    if (collectionView === 'editions') {
      return editions.map((edition) => ({ movie, edition }));
    }
    return [{ movie, edition: editions[0] }];
  }).sort((left, right) => {
    const titleOrder = (left.movie.alternativeTitle || left.movie.title)
      .localeCompare(right.movie.alternativeTitle || right.movie.title, undefined, { sensitivity: 'base' });
    if (titleOrder !== 0) return titleOrder;
    return (left.edition?.editionYear || 0) - (right.edition?.editionYear || 0)
      || (left.edition?.id || 0) - (right.edition?.id || 0);
  }), [collectionView, filteredMovies]);

  const carouselShelves = useMemo(() => {
    if (genreFilter !== 'all') {
      const selectedGenre = genres.find((genre) => genre.id === genreFilter);
      return selectedGenre ? [{ genre: selectedGenre, movies: filteredMovies }] : [];
    }
    return genres
      .map((genre) => ({
        genre,
        movies: filteredMovies.filter((movie) => movie.genres?.some((movieGenre) => movieGenre.id === genre.id)),
      }))
      .filter((shelf) => shelf.movies.length > 0);
  }, [filteredMovies, genreFilter, genres]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Collection library</Typography>
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
              sx={{ flex: { xs: '1 1 100%', md: '1 1 280px' }, minWidth: 0 }}
              label="Search title, original title, or alternative title"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }}>
              <InputLabel>Watched status</InputLabel>
              <Select label="Watched status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <MenuItem value="all">All</MenuItem>
                {watchedOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }} disabled={!genres.length}>
              <InputLabel>Genre</InputLabel>
              <Select label="Genre" value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                <MenuItem value="all">All genres</MenuItem>
                {genres.map((genre) => (
                  <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }}>
              <InputLabel>Show</InputLabel>
              <Select
                label="Show"
                value={collectionView}
                onChange={(event) => {
                  const nextView = event.target.value;
                  setSearchParams({ view: nextView });
                  if (nextView === 'editions') setDisplayMode('table');
                }}
              >
                <MenuItem value="movies">Movies</MenuItem>
                <MenuItem value="editions">Editions</MenuItem>
                <MenuItem value="favorites">Favorites</MenuItem>
                <MenuItem value="unwatched">Unwatched</MenuItem>
              </Select>
            </FormControl>
            {collectionView !== 'editions' && (
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                <Button
                  variant={displayMode === 'table' ? 'contained' : 'outlined'}
                  onClick={() => setDisplayMode('table')}
                  aria-pressed={displayMode === 'table'}
                  sx={{ flex: 1 }}
                >
                  List
                </Button>
                <Button
                  variant={displayMode === 'carousel' ? 'contained' : 'outlined'}
                  onClick={() => setDisplayMode('carousel')}
                  aria-pressed={displayMode === 'carousel'}
                  sx={{ flex: 1 }}
                >
                  Posters
                </Button>
              </Stack>
            )}
          </Stack>
          {genreError && <Alert severity="error" sx={{ mt: 2 }}>{genreError}</Alert>}
        </Paper>

        {displayMode === 'carousel' && collectionView !== 'editions' ? (
          <Stack spacing={3} aria-label="Movies by genre">
            {isLoading && (
              <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ py: 6 }}>
                <CircularProgress size={20} />
                <Typography color="text.secondary">Loading your collection...</Typography>
              </Stack>
            )}
            {loadError && <Alert severity="error">{loadError}</Alert>}
            {!isLoading && !loadError && carouselShelves.map(({ genre, movies: shelfMovies }) => (
              <MovieCarouselRow
                key={genre.id}
                genre={genre}
                movies={shelfMovies}
                onSelect={(movie) => navigate(`/edit-movie/${movie.id}${movie.editions?.[0] ? `?editionId=${movie.editions[0].id}` : ''}`)}
              />
            ))}
            {!isLoading && !loadError && !carouselShelves.length && (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
                <Typography color="text.secondary">No movies match these filters.</Typography>
              </Paper>
            )}
          </Stack>
        ) : (
        <>
          <CollectionMobileCards
            rows={displayedRows}
            isLoading={isLoading}
            loadError={loadError}
            onSelect={(movie, edition) => navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`)}
          />
          <Paper sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', borderRadius: 3, background: 'rgba(18,28,46,0.9)', overflow: 'hidden' }}>
            <TableContainer>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '25%' }}>Movie</TableCell>
                    <TableCell sx={{ width: '15%' }}>Genre</TableCell>
                    <TableCell sx={{ width: '10%' }}>Year</TableCell>
                    <TableCell sx={{ width: '20%' }}>Edition</TableCell>
                    <TableCell sx={{ width: '10%' }}>Barcode</TableCell>
                    <TableCell sx={{ width: '10%' }}>Status</TableCell>
                    <TableCell sx={{ width: '10%' }} align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
              </Table>
            </TableContainer>

            <Box ref={parentRef} sx={{ height: 600, overflow: 'auto' }}>
              <Table>
                <TableBody sx={{ display: 'block', position: 'relative', height: `${rowVirtualizer.getTotalSize()}px` }}>
                  {isLoading && (
                    <TableRow sx={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                      <TableCell colSpan={7} align="center" sx={{ borderBottom: 'none' }}>
                        <Stack direction="row" justifyContent="center" alignItems="center" spacing={1}>
                          <CircularProgress size={18} />
                          <span>Loading your collection...</span>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                  {loadError && (
                    <TableRow sx={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                      <TableCell colSpan={7} sx={{ borderBottom: 'none' }}>
                        <Alert severity="error">{loadError}</Alert>
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && !loadError && !displayedRows.length && (
                    <TableRow sx={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                      <TableCell colSpan={7} align="center" sx={{ borderBottom: 'none' }}>No catalog entries match these filters.</TableCell>
                    </TableRow>
                  )}

                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const { movie, edition } = displayedRows[virtualRow.index];
                    return (
                      <TableRow
                        key={`${movie.id}-${edition?.id || 'movie'}`}
                        hover
                        onClick={() => navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`)}
                        sx={{
                          cursor: 'pointer',
                          display: 'table',
                          width: '100%',
                          tableLayout: 'fixed',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <TableCell sx={{ width: '25%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Typography fontWeight={700} noWrap>{movie.alternativeTitle || movie.title}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {[movie.title, movie.originalTitle].filter(Boolean).join(' · ') || 'Movie title unavailable'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: '15%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(movie.genres || []).map((genre) => genre.name).join(', ') || '—'}</TableCell>
                        <TableCell sx={{ width: '10%' }}>{movie.releaseYear || '—'}</TableCell>
                        <TableCell sx={{ width: '20%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{edition ? `${formatLabel(edition.formatId)} · ${edition.editionYear || 'Year n/a'}` : 'No edition'}</TableCell>
                        <TableCell sx={{ width: '10%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{edition?.barcode || '—'}</TableCell>
                        <TableCell sx={{ width: '10%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {movie.favorite ? 'Favorite' : movie.watchedStatus || 'unwatched'}
                        </TableCell>
                        <TableCell sx={{ width: '10%' }} align="right">
                          <Button
                            size="small"
                            startIcon={<EditRounded />}
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`);
                            }}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </>
        )}
      </Stack>
    </Container>
  );
}
