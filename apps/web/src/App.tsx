import { Suspense, lazy } from 'react';
import { Link as RouterLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  CircularProgress,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import AddCircleOutlineRounded from '@mui/icons-material/AddCircleOutlineRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';

// ⚡ Bolt: Route-level code-splitting so each view loads only its own page & MUI components
const DashboardPage = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.DashboardPage })));
const AddMoviePage = lazy(() => import('./pages/AddMovie').then((module) => ({ default: module.AddMoviePage })));
const CollectionPage = lazy(() => import('./pages/Collection').then((module) => ({ default: module.CollectionPage })));

function PageFallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      <CircularProgress size={28} />
    </Box>
  );
}

const navItems = [
  { label: 'Home', to: '/', icon: <HomeRounded /> },
  { label: 'Add movie', to: '/add-movie', icon: <AddCircleOutlineRounded /> },
  { label: 'Collection', to: '/collection', icon: <MovieRounded /> },
];

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const mobileNavValue = location.pathname.startsWith('/add-movie') || location.pathname.startsWith('/edit-movie')
    ? '/add-movie'
    : location.pathname.startsWith('/collection')
      ? '/collection'
      : '/';

  return (
    <Box sx={{ minHeight: '100vh', pb: { xs: 'calc(68px + env(safe-area-inset-bottom))', md: 0 }, background: 'linear-gradient(180deg, #0c1628 0%, #0d1b2d 100%)', color: '#edf4ff' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'fixed',
          top: -100,
          left: 16,
          zIndex: (theme) => theme.zIndex.tooltip + 1,
          px: 2,
          py: 1,
          borderRadius: 2,
          bgcolor: '#8ab4ff',
          color: '#0c1628',
          fontWeight: 700,
          '&:focus': { top: 12, outline: '2px solid #edf4ff', outlineOffset: 2 },
        }}
      >
        Skip to main content
      </Box>
      <AppBar position="sticky" sx={{ top: 0, backdropFilter: 'blur(8px)', background: 'rgba(12,22,40,0.92)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
            Film Collection
          </Typography>
          <Stack component="nav" aria-label="Primary navigation" direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
            {navItems.map((item) => {
              const isActive = mobileNavValue === item.to;
              return (
                <Button
                  key={item.to}
                  color="inherit"
                  component={RouterLink}
                  to={item.to}
                  startIcon={item.icon}
                  aria-current={isActive ? 'page' : undefined}
                  sx={{
                    px: 1.75,
                    borderRadius: 2,
                    color: isActive ? '#8ab4ff' : 'inherit',
                    backgroundColor: isActive ? 'rgba(138,180,255,0.14)' : 'transparent',
                    '&:hover': { backgroundColor: isActive ? 'rgba(138,180,255,0.2)' : 'rgba(255,255,255,0.08)' },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="main" id="main-content" tabIndex={-1} sx={{ outline: 'none' }}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/add-movie" element={<AddMoviePage />} />
            <Route path="/edit-movie/:movieId" element={<AddMoviePage />} />
            <Route path="/collection" element={<CollectionPage />} />
          </Routes>
        </Suspense>
      </Box>

      <BottomNavigation
        showLabels
        value={mobileNavValue}
        onChange={(_event, value: string) => navigate(value)}
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          zIndex: (theme) => theme.zIndex.appBar,
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(64px + env(safe-area-inset-bottom))',
          pb: 'env(safe-area-inset-bottom)',
          background: 'rgba(12,22,40,0.96)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
          '& .MuiBottomNavigationAction-root': { minWidth: 0, minHeight: 56, color: 'rgba(237,244,255,0.68)' },
          '& .Mui-selected': { color: '#8ab4ff' },
        }}
      >
        <BottomNavigationAction label="Home" value="/" icon={<HomeRounded />} />
        <BottomNavigationAction label="Add movie" value="/add-movie" icon={<AddCircleOutlineRounded />} />
        <BottomNavigationAction label="Collection" value="/collection" icon={<MovieRounded />} />
      </BottomNavigation>
    </Box>
  );
}

export default App;
