import { useEffect, useState, useMemo } from 'react';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, CardMedia, Chip, CircularProgress, Container, FormControl, Grid, IconButton, InputAdornment, InputLabel, List, ListItem, ListItemButton, ListItemText, MenuItem, Paper, Select, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Alert } from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import AlbumRounded from '@mui/icons-material/AlbumRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Summary, Movie } from '../types';
import { API_BASE } from '../utils/helpers';

function StatCard({ title, value, subtitle, icon, to, isLoading }: { title: string; value: number; subtitle: string; icon: React.ReactNode; to: string; isLoading?: boolean }) {
  return (
    <Grid item xs={6} sm={6} md={3}>
      <Paper
        component={RouterLink}
        to={to}
        aria-label={`${title}: ${isLoading ? 'Loading' : value} — ${subtitle}`}
        sx={{
          p: { xs: 1.25, sm: 2.5 },
          borderRadius: 3,
          color: 'inherit',
          textDecoration: 'none',
          background: 'rgba(18,28,46,0.9)',
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          minHeight: { xs: 92, sm: 112 },
          cursor: 'pointer',
          '&:hover': { background: 'rgba(34,49,74,0.95)', transform: 'translateY(-2px)' },
          '&:focus-visible': { outline: '2px solid #8ab4ff', outlineOffset: 2 },
          transition: 'transform 150ms ease, background 150ms ease',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
            '&:hover': { transform: 'none' },
          },
        }}
      >
        <Box sx={{ width: { xs: 34, sm: 48 }, height: { xs: 34, sm: 48 }, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', background: 'rgba(138,180,255,0.12)', color: '#8ab4ff' }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {isLoading ? <Skeleton variant="text" width={36} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} /> : value}
          </Typography>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{subtitle}</Typography>
        </Box>
      </Paper>
    </Grid>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({ totalMovies: 0, totalEditions: 0, favorites: 0, unwatched: 0 });
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // ⚡ Bolt: /api/movies?limit=4 already returns the top 4 alphabetized movies from SQLite
  const topAlphabetizedMovies = movies;

  useEffect(() => {
    let cancelled = false;
    const loadDashboard = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [summaryRes, moviesRes] = await Promise.all([
          fetch(`${API_BASE}/summary`),
          // ⚡ Bolt: Fetch only the top 4 alphabetized movies instead of the full catalog + editions
          fetch(`${API_BASE}/movies?limit=4`),
        ]);
        if (!summaryRes.ok || !moviesRes.ok) {
          throw new Error('Could not load dashboard overview.');
        }
        const [summaryPayload, moviesPayload] = await Promise.all([
          summaryRes.json() as Promise<Summary>,
          moviesRes.json() as Promise<Movie[]>,
        ]);
        if (!cancelled) {
          setSummary(summaryPayload);
          setMovies(moviesPayload);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load dashboard overview.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
            Collection overview
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Catalog physical editions with barcode lookup, live metadata, and cover photos.
          </Typography>
        </Box>

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

        <Grid container spacing={2}>
          <StatCard title="Movies" value={summary.totalMovies} subtitle="View all catalog titles" icon={<DashboardRoundedIcon />} to="/collection?view=movies" isLoading={isLoading} />
          <StatCard title="Editions" value={summary.totalEditions} subtitle="View all physical editions" icon={<AlbumRounded />} to="/collection?view=editions" isLoading={isLoading} />
          <StatCard title="Favorites" value={summary.favorites} subtitle="View favorite titles" icon={<FavoriteRounded />} to="/collection?view=favorites" isLoading={isLoading} />
          <StatCard title="Unwatched" value={summary.unwatched} subtitle="View titles to watch" icon={<VisibilityOffRounded />} to="/collection?view=unwatched" isLoading={isLoading} />
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Intake workflow
                </Typography>
                <Button component={RouterLink} to="/add-movie" variant="outlined" size="small">
                  Start intake
                </Button>
              </Stack>
              <List disablePadding>
                {[
                  { title: 'Scan or enter the barcode', detail: 'Quick-match physical packaging' },
                  { title: 'Search by title and enrich metadata', detail: 'Pull synopsis, year, and IDs' },
                  { title: 'Review and confirm the movie match', detail: 'Verify title and original title' },
                  { title: 'Add front and back cover photos', detail: 'Capture or upload edition artwork' },
                  { title: 'Enter physical-edition details', detail: 'Format, region, condition, and shelf' },
                  { title: 'Save the completed edition', detail: 'Add it to your catalog' },
                ].map((step, index) => (
                  <ListItem
                    key={step.title}
                    sx={{ borderRadius: 1.5, borderBottom: index === 5 ? undefined : '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <ListItemText primary={`${index + 1}. ${step.title}`} secondary={step.detail} />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Movies A-Z
                </Typography>
                <Button component={RouterLink} to="/collection" size="small">
                  View all
                </Button>
              </Stack>
              <Stack spacing={1.5}>
                {isLoading ? (
                  [0, 1, 2, 3].map((idx) => (
                    <Skeleton key={idx} variant="rounded" height={64} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
                  ))
                ) : topAlphabetizedMovies.length ? (
                  topAlphabetizedMovies.map((movie) => (
                    <ListItemButton
                      key={movie.id}
                      component={RouterLink}
                      to={`/edit-movie/${movie.id}`}
                      sx={{
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 2,
                        p: 1.8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1,
                        '&:hover': { background: 'rgba(34,49,74,0.65)' },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} noWrap>{movie.alternativeTitle || movie.title}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {movie.title}{movie.releaseYear ? ` · ${movie.releaseYear}` : ''} · {movie.watchedStatus ? `${movie.watchedStatus.charAt(0).toUpperCase()}${movie.watchedStatus.slice(1)}` : 'Unwatched'}
                        </Typography>
                      </Box>
                      <ChevronRightRounded sx={{ color: 'text.secondary', flexShrink: 0 }} />
                    </ListItemButton>
                  ))
                ) : loadError ? (
                  <Typography variant="body2" color="text.secondary">
                    Catalog preview unavailable while offline.
                  </Typography>
                ) : (
                  <Stack spacing={1.5} alignItems="flex-start">
                    <Typography variant="body2" color="text.secondary">
                      No movies in your collection yet.
                    </Typography>
                    <Button component={RouterLink} to="/add-movie" variant="outlined" size="small">
                      Add your first movie
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
