import { useEffect, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, CircularProgress, Container, FormControl, FormControlLabel, Grid, InputAdornment, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography, Chip } from '@mui/material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SearchIcon from '@mui/icons-material/Search';
import { Movie, Genre, SearchResult, UploadedCover, BarcodeScanStatus, CoverUploadStatus } from '../types';
import { API_BASE, emptyMovieForm, pendingCoversStorageKey, prepareMobileImage, readPendingCovers, removePendingCover, persistPendingCover, rotateImage180, coverReference, isValidRetailBarcode } from '../utils/helpers';
import { UploadField, NameOptionField, SuggestionField } from '../components/FormFields';
import { formatOptions, editionTypeOptions, watchedOptions, ageRatingOptions, countryOptions, languageOptions, movieVersionOptions, conditionOptions, regionOptions } from '../utils/constants';


const movieFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  originalTitle: z.string().optional().nullable(),
  alternativeTitle: z.string().optional().nullable(),
  countryId: z.string().optional().nullable(),
  originalLanguageId: z.string().optional().nullable(),
  releaseYear: z.union([z.string(), z.number()]).optional().nullable(),
  releaseDate: z.string().optional().nullable(),
  ageRating: z.string().optional().nullable(),
  synopsis: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  favorite: z.boolean().optional(),
  genreIds: z.array(z.string()).optional(),
  watchedStatus: z.string().optional().nullable(),
  watchedDate: z.string().optional().nullable(),
  formatId: z.string().optional().nullable(),
  editionTypeId: z.string().optional().nullable(),
  movieVersionId: z.string().optional().nullable(),
  distributorId: z.string().optional().nullable(),
  countryEditionId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  collectionId: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  catalogNumber: z.string().optional().nullable(),
  editionYear: z.union([z.string(), z.number()]).optional().nullable(),
  condition: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  purchasePrice: z.union([z.string(), z.number()]).optional().nullable(),
  estimatedValue: z.union([z.string(), z.number()]).optional().nullable(),
  editionNotes: z.string().optional().nullable(),
  imdbId: z.string().optional().nullable(),
  tmdbId: z.string().optional().nullable(),
  imdbUrl: z.string().optional().nullable(),
  tmdbUrl: z.string().optional().nullable(),
  posterPath: z.string().optional().nullable(),
  discCount: z.union([z.string(), z.number()]).optional().nullable(),
  steelbook: z.boolean().optional(),
  slipcover: z.boolean().optional(),
  digibook: z.boolean().optional(),
  booklet: z.boolean().optional(),
  posterIncluded: z.boolean().optional(),
});
type MovieFormData = z.infer<typeof movieFormSchema>;

export function AddMoviePage() {
  const queryClient = useQueryClient();
  const { movieId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(movieId);
  const wasEditingRef = useRef(isEditing);
  const { control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<MovieFormData>({ resolver: zodResolver(movieFormSchema), defaultValues: emptyMovieForm });
  const [frontCover, setFrontCover] = useState<File | null>(null);
  const [backCover, setBackCover] = useState<File | null>(null);
  const [rotatingCovers, setRotatingCovers] = useState<{ front?: boolean; back?: boolean }>({});
  const [uploadedCovers, setUploadedCovers] = useState<{ front?: UploadedCover; back?: UploadedCover }>(() => {
    try {
      const saved = sessionStorage.getItem(pendingCoversStorageKey);
      if (!saved) return {};
      const parsed = JSON.parse(saved) as { front?: UploadedCover; back?: UploadedCover };
      const isValidCover = (cover: UploadedCover | undefined) => (
        Boolean(
          cover
          && typeof cover.filename === 'string'
          && typeof cover.path === 'string'
          && cover.path === `/uploads/${cover.filename}`
          && !cover.filename.includes('..')
          && !/[\\/]/.test(cover.filename),
        )
      );
      return {
        ...(isValidCover(parsed.front) ? { front: parsed.front } : {}),
        ...(isValidCover(parsed.back) ? { back: parsed.back } : {}),
      };
    } catch {
      return {};
    }
  });
  const [uploadingCovers, setUploadingCovers] = useState<{ front: boolean; back: boolean }>({ front: false, back: false });
  const [coverUploadStatus, setCoverUploadStatus] = useState<{ front?: CoverUploadStatus; back?: CoverUploadStatus }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isReadingBarcode, setIsReadingBarcode] = useState(false);
  const [barcodeScanStatus, setBarcodeScanStatus] = useState<BarcodeScanStatus | null>(null);
  const [isLookingUpMetadata, setIsLookingUpMetadata] = useState(false);
  const [isLoadingMovie, setIsLoadingMovie] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEditionId, setEditingEditionId] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genreError, setGenreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadGenres = async () => {
      try {
        const response = await fetch(`${API_BASE}/genres`);
        const payload = await response.json() as Genre[] | { message?: string };
        if (!response.ok) {
          throw new Error(!Array.isArray(payload) ? payload.message || 'Could not load genres.' : 'Could not load genres.');
        }
        if (!Array.isArray(payload)) throw new Error('The genre list returned an invalid response.');
        if (!cancelled) setGenres(payload);
      } catch (error) {
        if (!cancelled) setGenreError(error instanceof Error ? error.message : 'Could not load genres.');
      }
    };
    void loadGenres();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isEditing) return;
    if (uploadedCovers.front || uploadedCovers.back) {
      sessionStorage.setItem(pendingCoversStorageKey, JSON.stringify(uploadedCovers));
    } else {
      sessionStorage.removeItem(pendingCoversStorageKey);
    }
  }, [isEditing, uploadedCovers]);

  useEffect(() => {
    if (!movieId) {
      setIsLoadingMovie(false);
      if (wasEditingRef.current) {
        reset(emptyMovieForm);
        setUploadedCovers({});
        setFrontCover(null);
        setBackCover(null);
        setEditingEditionId(null);
        setStatusMessage(null);
      }
      wasEditingRef.current = false;
      return;
    }
    wasEditingRef.current = true;
    let cancelled = false;

    const loadMovieForEdit = async () => {
      setIsLoadingMovie(true);
      try {
        const response = await fetch(`${API_BASE}/movies`);
        const movies = await response.json() as Movie[];
        if (!response.ok) throw new Error('Could not load the collection entry for editing.');
        const movie = movies.find((item) => item.id === Number(movieId));
        if (!movie) throw new Error('This movie was not found in the collection.');
        const requestedEdition = searchParams.get('editionId');
        const requestedEditionId = requestedEdition ? Number(requestedEdition) : null;
        const edition = requestedEditionId
          ? movie.editions?.find((item) => item.id === requestedEditionId)
          : movie.editions?.[0];
        if (requestedEditionId && !edition) throw new Error('The selected edition was not found for this movie.');
        if (!edition) throw new Error('This movie has no physical edition to edit.');
        if (cancelled) return;

        setEditingEditionId(edition.id);
        reset({
          ...emptyMovieForm,
          title: movie.title || '',
          originalTitle: movie.originalTitle || '',
          alternativeTitle: movie.alternativeTitle || '',
          countryId: movie.countryId || '',
          originalLanguageId: movie.originalLanguageId || '',
          releaseYear: movie.releaseYear ? String(movie.releaseYear) : '',
          releaseDate: movie.releaseDate || '',
          ageRating: movie.ageRating || '',
          synopsis: movie.synopsis || '',
          notes: movie.notes || '',
          favorite: Boolean(movie.favorite),
          watchedStatus: movie.watchedStatus || 'unwatched',
          watchedDate: movie.watchedDate || '',
          genreIds: (movie.genres || []).map((genre) => genre.id),
          formatId: edition.formatId || '',
          editionTypeId: edition.editionTypeId || '',
          movieVersionId: edition.movieVersionId || '',
          distributorId: edition.distributorId || '',
          countryEditionId: edition.countryEditionId || '',
          locationId: edition.locationId || '',
          collectionId: edition.collectionId || '',
          barcode: edition.barcode || '',
          catalogNumber: edition.catalogNumber || '',
          editionYear: edition.editionYear ? String(edition.editionYear) : '',
          condition: edition.condition || '',
          region: edition.region || '',
          purchasePrice: edition.purchasePrice === null || edition.purchasePrice === undefined ? '' : String(edition.purchasePrice),
          estimatedValue: edition.estimatedValue === null || edition.estimatedValue === undefined ? '' : String(edition.estimatedValue),
          editionNotes: edition.notes || '',
          imdbId: movie.imdbId || '',
          tmdbId: movie.tmdbId || '',
          imdbUrl: movie.imdbUrl || '',
          tmdbUrl: movie.tmdbUrl || '',
          posterPath: movie.posterPath || '',
          discCount: edition.discCount ? String(edition.discCount) : '',
          steelbook: Boolean(edition.steelbook),
          slipcover: Boolean(edition.slipcover),
          digibook: Boolean(edition.digibook),
          booklet: Boolean(edition.booklet),
          posterIncluded: Boolean(edition.posterIncluded),
        });
        setUploadedCovers({
          ...(edition.frontCoverPath ? { front: coverReference(edition.frontCoverPath) } : {}),
          ...(edition.backCoverPath ? { back: coverReference(edition.backCoverPath) } : {}),
        });
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : 'Could not load this movie for editing.');
        }
      } finally {
        if (!cancelled) setIsLoadingMovie(false);
      }
    };

    void loadMovieForEdit();
    return () => {
      cancelled = true;
    };
  }, [isEditing, movieId, searchParams]);


  const handleCoverSelected = async (slot: 'front' | 'back', file: File | null) => {
    if (!file) {
      return;
    }

    if (slot === 'front') {
      setFrontCover(file);
    } else {
      setBackCover(file);
    }
    setUploadingCovers((current) => ({ ...current, [slot]: true }));
    setCoverUploadStatus((current) => ({
      ...current,
      [slot]: {
        severity: 'info',
        message: `Preparing ${file.name || 'camera image'} · ${(file.size / (1024 * 1024)).toFixed(1)} MB for upload. Your last saved cover remains available until this one succeeds.`,
      },
    }));
    setStatusMessage(`Preparing and saving the ${slot} cover photo...`);

    try {
      await persistPendingCover(slot, file);
      const preparedImage = await prepareMobileImage(file, 'cover');
      if (slot === 'front') {
        setFrontCover(preparedImage);
      } else {
        setBackCover(preparedImage);
      }

      const data = new FormData();
      data.append('slot', slot);
      data.append('image', preparedImage);

      const response = await fetch(`${API_BASE}/upload-cover`, {
        method: 'POST',
        body: data,
      });
      const responseText = await response.text();
      let result: {
        success?: boolean;
        message?: string;
        file?: { slot?: string; filename?: string; path?: string };
      };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        const diagnostic = responseText
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        throw new Error(`${slot === 'front' ? 'Front' : 'Back'} cover upload returned HTTP ${response.status}, not JSON. ${diagnostic || 'The server returned an empty response.'}`);
      }
      const uploadedFile = result.file;

      if (
        !response.ok
        || !result.success
        || uploadedFile?.slot !== slot
        || typeof uploadedFile.filename !== 'string'
        || typeof uploadedFile.path !== 'string'
      ) {
        throw new Error(result.message || `Could not upload the ${slot} cover.`);
      }

      const savedCoverUrl = `${API_BASE.replace(/\/api$/, '')}${uploadedFile.path}`;
      const savedPreview = await fetch(savedCoverUrl, { method: 'HEAD', cache: 'no-store' });
      if (!savedPreview.ok || !savedPreview.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`${slot === 'front' ? 'Front' : 'Back'} photo uploaded, but the saved server copy could not be verified. Try capturing it again.`);
      }

      const savedCover = { filename: uploadedFile.filename, path: uploadedFile.path };
      try {
        const existing = JSON.parse(sessionStorage.getItem(pendingCoversStorageKey) || '{}') as { front?: UploadedCover; back?: UploadedCover };
        sessionStorage.setItem(pendingCoversStorageKey, JSON.stringify({ ...existing, [slot]: savedCover }));
      } catch {
        setCoverUploadStatus((current) => ({
          ...current,
          [slot]: {
            severity: 'warning',
            message: 'Photo is saved on the server, but this browser could not retain its draft after a page reload. Keep this page open until you save the movie.',
          },
        }));
      }

      setUploadedCovers((current) => ({
        ...current,
        [slot]: savedCover,
      }));
      try {
        await removePendingCover(slot);
      } catch (error) {
        console.error(`Could not clear the completed ${slot} cover draft`, error);
      }
      setCoverUploadStatus((current) => ({
        ...current,
        [slot]: {
          severity: 'success',
          message: `${slot === 'front' ? 'Front' : 'Back'} cover photo saved and verified.`,
        },
      }));
      setStatusMessage(`${slot === 'front' ? 'Front' : 'Back'} cover photo saved and verified.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not prepare or upload the ${slot} cover.`;
      setCoverUploadStatus((current) => ({
        ...current,
        [slot]: { severity: 'error', message },
      }));
      setStatusMessage(message);
    } finally {
      setUploadingCovers((current) => ({ ...current, [slot]: false }));
    }
  };

  const handleRotateCover = async (slot: 'front' | 'back') => {
    const cover = uploadedCovers[slot];
    if (!cover) return;

    setRotatingCovers((current) => ({ ...current, [slot]: true }));
    try {
      const imageResponse = await fetch(`${API_BASE.replace(/\/api$/, '')}${cover.path}`, { cache: 'no-store' });
      if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`Could not load the saved ${slot} cover to rotate it.`);
      }
      const rotatedImage = await rotateImage180(await imageResponse.blob(), `${slot}-cover.jpg`);
      await handleCoverSelected(slot, rotatedImage);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not rotate the ${slot} cover.`;
      setCoverUploadStatus((current) => ({
        ...current,
        [slot]: { severity: 'error', message },
      }));
      setStatusMessage(message);
    } finally {
      setRotatingCovers((current) => ({ ...current, [slot]: false }));
    }
  };

  useEffect(() => {
    if (isEditing) return;
    let cancelled = false;
    void readPendingCovers()
      .then(async ([front, back]) => {
        if (cancelled) return;
        if (front) await handleCoverSelected('front', front);
        if (cancelled) return;
        if (back) await handleCoverSelected('back', back);
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Could not restore a pending camera photo.';
          setStatusMessage(`A captured cover could not be restored after returning from the camera: ${message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isEditing]);

  const handleBarcodeImage = async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsReadingBarcode(true);
    setBarcodeScanStatus({
      severity: 'info',
      message: `Photo received (${file.name}, ${(file.size / (1024 * 1024)).toFixed(1)} MB). Preparing and reading barcode...`,
    });

    try {
      const preparedImage = await prepareMobileImage(file, 'barcode');
      const data = new FormData();
      data.append('image', preparedImage);
      const response = await fetch(`${API_BASE}/barcode/read`, { method: 'POST', body: data });
      const responseText = await response.text();
      let result: {
        success?: boolean;
        found?: boolean;
        barcode?: string;
        format?: string | null;
        source?: string | null;
        validated?: boolean;
        message?: string;
      };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        const responseHint = responseText
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        const contentType = response.headers.get('content-type') || 'unknown content type';
        throw new Error(
          `Barcode service returned HTTP ${response.status} (${contentType}) instead of JSON. ${responseHint || 'The server returned an empty response.'} Check that the app server is running, then retry or choose the photo from your gallery.`,
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Barcode reading failed (HTTP ${response.status}).`);
      }
      if (!result.found || !result.barcode) {
        const message = result.message || 'No barcode was found.';
        setBarcodeScanStatus({
          severity: 'warning',
          message: `${message} Fill the frame with the barcode, avoid glare, and try again—or choose a photo or enter the digits manually.`,
        });
        return;
      }

      setValue('barcode', result.barcode, { shouldValidate: true, shouldDirty: true });
      setBarcodeScanStatus({
        severity: 'success',
        message: `Barcode captured: ${result.barcode}${result.validated ? ' (checksum valid)' : ' (please verify the digits)'} · ${result.source || result.format || 'image scan'}.`,
      });
      await handleLookupMetadata(result.barcode);
    } catch (error) {
      setBarcodeScanStatus({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Barcode reading failed. Choose another image or enter the digits manually.',
      });
    } finally {
      setIsReadingBarcode(false);
    }
  };

  const handleLookupMetadata = async (barcodeReference?: string) => {
    const barcode = (barcodeReference ?? watch('barcode') ?? '').trim();
    const lookupQueries = Array.from(new Set([
      (watch('title') || '').trim(),
      (watch('originalTitle') || '').trim(),
    ].filter(Boolean)));

    if (!lookupQueries.length && !barcode) {
      setStatusMessage('Enter a movie title or barcode before looking up metadata.');
      return;
    }

    setIsLookingUpMetadata(true);
    setStatusMessage(barcode ? 'Looking up this barcode in the catalog and live product metadata...' : 'Searching live TMDb and IMDb-linked metadata...');

    try {
      if (barcode) {
        const response = await fetch(`${API_BASE}/metadata/barcode?barcode=${encodeURIComponent(barcode)}`);
        const payload = await response.json() as {
          results?: SearchResult[];
          message?: string;
          source?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || `Barcode metadata lookup failed (HTTP ${response.status}).`);
        }
        if (payload.results?.length) {
          setSearchResults(payload.results);
          setStatusMessage(`${payload.message || `Barcode match found via ${payload.source || 'metadata lookup'}.`} Review a match before applying it.`);
          return;
        }
        if (!lookupQueries.length) {
          setSearchResults([]);
          setStatusMessage(payload.message || `No metadata match was found for barcode ${barcode}. Enter a movie title to search TMDb and IMDb.`);
          return;
        }
      }

      for (const query of lookupQueries) {
        const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
        const payload = (await response.json()) as { results?: SearchResult[]; message?: string };
        if (!response.ok) {
          throw new Error(payload.message || `Metadata lookup failed (HTTP ${response.status}).`);
        }
        if (payload.results?.length) {
          setSearchResults(payload.results);
          setStatusMessage(`Live metadata matches found for “${query}”. Review a match before applying it.`);
          return;
        }
      }

      setSearchResults([]);
      setStatusMessage('No live metadata matches were found. Check the barcode or title and try again, or enter the details manually.');
    } catch (error) {
      setSearchResults([]);
      setStatusMessage(error instanceof Error ? error.message : 'Metadata lookup failed.');
    } finally {
      setIsLookingUpMetadata(false);
    }
  };

  const applyMetadata = (result: SearchResult) => {
    const year = result.release_date || result.releaseDate || '';
    const parsedYear = year ? String(year).slice(0, 4) : '';

    if (result.title) setValue('title', result.title);
    if (result.original_title || result.originalTitle) setValue('originalTitle', result.original_title || result.originalTitle);
    if (parsedYear) setValue('releaseYear', parsedYear);
    if (year) setValue('releaseDate', year);
    if (result.overview) setValue('synopsis', result.overview);
    if (result.imdb_id) setValue('imdbId', result.imdb_id);
    if (result.tmdbId || result.id) setValue('tmdbId', result.tmdbId || String(result.id));
    if (result.imdb_id) setValue('imdbUrl', `https://www.imdb.com/title/${result.imdb_id}/`);
    if (result.tmdbUrl || result.id) setValue('tmdbUrl', result.tmdbUrl || `https://www.themoviedb.org/movie/${result.id}`);
    if (result.poster_path) {
       setValue('posterPath', result.poster_path.startsWith('http') ? result.poster_path : `https://image.tmdb.org/t/p/w500${result.poster_path}`);
    }

    // Attempt to map genres if returned
    if (result.Genre && Array.isArray(result.Genre)) {
       const mapped = result.Genre.map(g => genres.find(genre => genre.name.toLowerCase() === g.toLowerCase())?.id).filter(Boolean) as string[];
       if (mapped.length) setValue('genreIds', mapped);
    }

    setStatusMessage(`Metadata from ${result.source || 'source'} applied to the entry.`);
  };

  const resetIntake = () => {
    reset(emptyMovieForm);
    setUploadedCovers({});
    setFrontCover(null);
    setBackCover(null);
    setCoverUploadStatus({});
    setBarcodeScanStatus(null);
    setSearchResults([]);
    setStatusMessage(null);
  };

  const onSubmit = async (data: MovieFormData) => {

    if (
      (frontCover && !uploadedCovers.front)
      || (backCover && !uploadedCovers.back)
      || uploadingCovers.front
      || uploadingCovers.back
      || rotatingCovers.front
      || rotatingCovers.back
    ) {
      setStatusMessage('Wait for the selected cover images to finish uploading or rotating before saving.');
      return;
    }
    if (!isEditing && (!uploadedCovers.front || !uploadedCovers.back)) {
      setStatusMessage('Add and save both the front and back cover photos before saving this movie.');
      return;
    }

    const body = {
      ...(isEditing && editingEditionId ? { editionId: editingEditionId } : {}),
      ...data,
      releaseYear: Number(data.releaseYear) || null,
      editionYear: Number(data.editionYear) || null,
      purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : null,
      estimatedValue: data.estimatedValue ? Number(data.estimatedValue) : null,
      favorite: Boolean(data.favorite),
      genreIds: data.genreIds,
      steelbook: Boolean(data.steelbook),
      slipcover: Boolean(data.slipcover),
      digibook: Boolean(data.digibook),
      booklet: Boolean(data.booklet),
      posterIncluded: Boolean(data.posterIncluded),
      ...(uploadedCovers.front ? { frontCoverPath: uploadedCovers.front.path } : {}),
      ...(uploadedCovers.back ? { backCoverPath: uploadedCovers.back.path } : {}),
    };

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `${API_BASE}/movies/${movieId}` : `${API_BASE}/ingest`, {
        method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || (isEditing ? 'Unable to save changes.' : 'Unable to save the movie.'));
      }
      if (isEditing) {
        navigate('/collection');
        return;
      }
      setStatusMessage('Movie and edition saved to your collection.');
      reset(emptyMovieForm);
      setUploadedCovers({});
      setSearchResults([]);
      setFrontCover(null);
      setBackCover(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to save this entry.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingMovie) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography color="text.secondary">Loading movie and edition details…</Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 1.75, sm: 3 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
        <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>
          {isEditing ? `Edit ${watch('title') || 'movie'}` : 'Capture and catalog a physical movie'}
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          {isEditing
            ? 'Update the movie and selected physical edition. Existing cover photos are kept unless you replace them.'
            : 'Identify the movie with its barcode or title, review live metadata, then add its cover photos and edition details before saving.'}
        </Alert>

        <Box component="form" onSubmit={handleSubmit(onSubmit)}>
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>1. Identify the movie</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Scan the package barcode or search by title. Review a matching catalog/API result before adding photos.
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <Controller name="title" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth label="Movie title" required error={!!errors.title} helperText={errors.title?.message} />} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller name="originalTitle" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth label="Original title" />} />
              </Grid>
              <Grid item xs={12} md={5}>
                <Controller name="barcode" control={control} render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Barcode"
                    value={field.value || ''}
                    helperText={field.value ? (isValidRetailBarcode(field.value) ? 'Retail barcode check digit is valid.' : 'Check the digits; checksum validation does not recognize this as a standard retail code.') : 'Scan the barcode on the packaging or enter it manually.'}
                  />
                )} />
              </Grid>
              <Grid item xs={12} md={7}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button component="label" variant="outlined" disabled={isReadingBarcode} startIcon={isReadingBarcode ? <CircularProgress size={18} /> : <PhotoCamera />} sx={{ flex: 1 }}>
                    {isReadingBarcode ? 'Reading barcode...' : 'Scan barcode'}
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] || null;
                        event.currentTarget.value = '';
                        void handleBarcodeImage(file);
                      }}
                    />
                  </Button>
                  <Button component="label" variant="text" disabled={isReadingBarcode} sx={{ flex: 1 }}>
                    Choose barcode photo
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] || null;
                        event.currentTarget.value = '';
                        void handleBarcodeImage(file);
                      }}
                    />
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => void handleLookupMetadata()}
                    disabled={isLookingUpMetadata || isReadingBarcode}
                    startIcon={isLookingUpMetadata ? <CircularProgress size={18} /> : <SearchIcon />}
                    sx={{ flex: 1 }}
                  >
                    {isLookingUpMetadata ? 'Searching...' : 'Look up metadata'}
                  </Button>
                </Stack>
              </Grid>
            </Grid>
            {barcodeScanStatus && (
              <Alert severity={barcodeScanStatus.severity} sx={{ mt: 2 }}>
                {barcodeScanStatus.message}
              </Alert>
            )}
            {statusMessage && (
              <Alert severity={statusMessage.includes('could not') || statusMessage.includes('Could not') || statusMessage.includes('Unable') || statusMessage.includes('failed') || statusMessage.includes('Failed') || statusMessage.includes('No metadata') ? 'error' : 'info'} sx={{ mt: 2 }}>
                {statusMessage}
              </Alert>
            )}
            {searchResults.length > 0 && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>Review metadata matches</Typography>
                {[...searchResults].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })).map((result, index) => (
                  <Paper key={`${result.title}-${index}`} sx={{ p: 2, borderRadius: 2, background: 'rgba(18,28,46,0.9)' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                      <Box>
                        <Typography fontWeight={700}>{result.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {result.original_title || result.originalTitle || 'Original title unavailable'} · {result.release_date || result.releaseDate || 'Release date unavailable'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {result.overview || 'No overview available.'}
                        </Typography>
                      </Box>
                      <Button variant="outlined" onClick={() => applyMetadata(result)} sx={{ alignSelf: { md: 'center' }, flexShrink: 0 }}>
                        Use metadata
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>2. Add cover photos</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              After identifying the movie, capture or choose its front and back cover. Photos are saved with the edition; no text is extracted from them.
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <UploadField
                label="Front cover"
                value={frontCover}
                uploading={uploadingCovers.front}
                uploaded={Boolean(uploadedCovers.front)}
                uploadedPath={uploadedCovers.front?.path}
                uploadStatus={coverUploadStatus.front}
                rotating={Boolean(rotatingCovers.front)}
                onChange={(file) => void handleCoverSelected('front', file)}
                onRetry={() => void handleCoverSelected('front', frontCover)}
                onRotate={() => void handleRotateCover('front')}
              />
              <UploadField
                label="Back cover"
                value={backCover}
                uploading={uploadingCovers.back}
                uploaded={Boolean(uploadedCovers.back)}
                uploadedPath={uploadedCovers.back?.path}
                uploadStatus={coverUploadStatus.back}
                rotating={Boolean(rotatingCovers.back)}
                onChange={(file) => void handleCoverSelected('back', file)}
                onRetry={() => void handleCoverSelected('back', backCover)}
                onRotate={() => void handleRotateCover('back')}
              />
            </Stack>
          </Paper>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>3. Confirm edition details and save</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight={700}>Movie details</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller name="genreIds" control={control} render={({ field }) => (
                <FormControl fullWidth disabled={!genres.length || Boolean(genreError)}>
                  <InputLabel id="movie-genres-label">Genres</InputLabel>
                  <Select
                    {...field}
                    labelId="movie-genres-label"
                    multiple
                    label="Genres"
                    value={field.value || []}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((id) => <Chip key={id} label={genres.find((genre) => genre.id === id)?.name || id} size="small" />)}
                      </Box>
                    )}
                  >
                    {genres.map((genre) => (
                      <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )} />
              {genreError && <Alert severity="error" sx={{ mt: 1 }}>{genreError}</Alert>}
              {!genreError && !genres.length && <Typography variant="caption" color="text.secondary">Loading genres...</Typography>}
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="alternativeTitle" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth label="Alternative title" />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="countryId" control={control} render={({ field }) => <NameOptionField label="Movie country" value={field.value || ''} options={countryOptions} helperText="Search by country name, or type a country." onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="originalLanguageId" control={control} render={({ field }) => <NameOptionField label="Original language" value={field.value || ''} options={languageOptions} helperText="Search by language name, or type a language." onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="releaseYear" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="number" label="Release year" />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="releaseDate" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="date" InputLabelProps={{ shrink: true }} label="Release date" />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="ageRating" control={control} render={({ field }) => <SuggestionField label="Age rating" value={field.value || ''} options={ageRatingOptions} onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="favorite" control={control} render={({ field }) => <FormControlLabel control={<Checkbox checked={field.value} onChange={field.onChange} />} label="Favorite" />} />
            </Grid>
            <Grid item xs={12}>
              <Controller name="synopsis" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth multiline minRows={3} label="Synopsis" />} />
            </Grid>
            <Grid item xs={12}>
              <Controller name="notes" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth multiline minRows={2} label="Movie notes" />} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 1 }}>Physical edition</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="editionYear" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="number" label="Edition year" />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="catalogNumber" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth label="Catalog number" />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="discCount" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="number" label="Disc count" />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="formatId" control={control} render={({ field }) => <FormControl fullWidth><InputLabel>Format</InputLabel><Select {...field} value={field.value || ''} label="Format">{formatOptions.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl>} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="editionTypeId" control={control} render={({ field }) => <FormControl fullWidth><InputLabel>Edition type</InputLabel><Select {...field} value={field.value || ''} label="Edition type">{editionTypeOptions.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl>} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="watchedStatus" control={control} render={({ field }) => <FormControl fullWidth><InputLabel>Watched status</InputLabel><Select {...field} value={field.value || ''} label="Watched status">{watchedOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</Select></FormControl>} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="condition" control={control} render={({ field }) => <SuggestionField label="Condition" value={field.value || ''} options={conditionOptions} onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="countryEditionId" control={control} render={({ field }) => <NameOptionField label="Edition country" value={field.value || ''} options={countryOptions} helperText="Country where this edition was released." onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="distributorId" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth placeholder="e.g. Warner Bros." label="Distributor" />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="movieVersionId" control={control} render={({ field }) => <SuggestionField label="Movie version" value={field.value || ''} options={movieVersionOptions} onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="collectionId" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth placeholder="e.g. Sci-fi shelf" label="Collection name" />} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="locationId" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth placeholder="e.g. Living room · Shelf 2" label="Storage location" />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="region" control={control} render={({ field }) => <SuggestionField label="DVD / Blu-ray region" value={field.value || ''} options={regionOptions} onChange={field.onChange} />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="purchasePrice" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="number" label="Purchase price" InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }} />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="estimatedValue" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="number" label="Estimated value" InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }} />} />
            </Grid>
            <Grid item xs={12}>
              <Accordion sx={{ width: '100%', background: 'rgba(11,19,33,0.75)' }}>
                <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                  <Box>
                    <Typography fontWeight={600}>External IDs and links (optional)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Usually filled automatically when you apply a metadata match.
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <Controller name="imdbId" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth placeholder="e.g. tt0133093" label="IMDb title ID" />} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Controller name="imdbUrl" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth placeholder="https://www.imdb.com/title/..." label="IMDb link" />} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Controller name="tmdbUrl" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth placeholder="https://www.themoviedb.org/movie/..." label="TMDb link" />} />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
            <Grid item xs={12}>
              <Controller name="editionNotes" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth multiline minRows={2} label="Edition notes" />} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="watchedDate" control={control} render={({ field }) => <TextField {...field} value={field.value || ''} fullWidth type="date" InputLabelProps={{ shrink: true }} label="Watched date" />} />
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
            <Button type="submit" variant="contained" size="large" disabled={isSaving || !genres.length || Boolean(genreError) || (isEditing && !editingEditionId) || uploadingCovers.front || uploadingCovers.back || rotatingCovers.front || rotatingCovers.back} startIcon={isSaving ? <CircularProgress size={18} /> : undefined}>
              {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Save to collection'}
            </Button>
            {isEditing
              ? <Button variant="outlined" size="large" onClick={() => navigate('/collection')}>Cancel</Button>
              : <Button variant="outlined" size="large" onClick={resetIntake}>Reset form</Button>}
          </Stack>
        </Box>
      </Paper>
    </Container>
  );
}
