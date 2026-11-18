import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, FormControlLabel, Grid, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography, Chip } from '@mui/material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SearchIcon from '@mui/icons-material/Search';
import ClearRounded from '@mui/icons-material/ClearRounded';
import { Movie, Genre, Edition, SearchResult, UploadedCover, BarcodeScanStatus, CoverUploadStatus } from '../types';
import { API_BASE, emptyMovieForm, pendingCoversStorageKey, prepareMobileImage, readPendingCovers, removePendingCover, persistPendingCover, rotateImage180, coverReference, isValidRetailBarcode, baseCollator } from '../utils/helpers';
import { UploadField, NameOptionField, SuggestionField } from '../components/FormFields';
import { formatLabel, formatOptions, editionTypeOptions, watchedOptions, ageRatingOptions, countryOptions, languageOptions, movieVersionOptions, conditionOptions, regionOptions } from '../utils/constants';

function getStatusSeverity(msg: string): 'error' | 'warning' | 'success' | 'info' {
  const lower = msg.toLowerCase();
  if (
    lower.includes('could not')
    || lower.includes('unable')
    || lower.includes('failed')
    || lower.includes('no metadata')
    || lower.includes('no live metadata')
    || lower.includes('wait for')
    || lower.includes('add and save both')
    || lower.includes('before looking up')
  ) {
    return 'error';
  }
  if (
    lower.includes('saved')
    || lower.includes('applied')
    || lower.includes('captured')
    || lower.includes('found')
  ) {
    return 'success';
  }
  return 'info';
}

function editionFormatLabel(formatId?: string | null) {
  return formatLabel(formatId, 'Edition');
}

export function AddMoviePage() {
  const { movieId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(movieId);
  const wasEditingRef = useRef(isEditing);
  const [form, setForm] = useState(emptyMovieForm);
  const isBarcodeValid = useMemo(() => (form.barcode ? isValidRetailBarcode(form.barcode) : false), [form.barcode]);
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
  const [movieEditions, setMovieEditions] = useState<Edition[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genreError, setGenreError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [appliedResultKey, setAppliedResultKey] = useState<string | null>(null);

  // ⚡ Bolt: Extract inline sort into useMemo to prevent unnecessary array allocations and O(N log N) sorting on every render
  const sortedSearchResults = useMemo(
    () => [...searchResults].sort((left, right) => baseCollator.compare(left.title, right.title)),
    [searchResults]
  );

  const genreNameMap = useMemo(
    () => new Map(genres.map((genre) => [genre.id, genre.name])),
    [genres],
  );
  const step1Ready = Boolean(form.title.trim());
  const step2Ready = Boolean(uploadedCovers.front && uploadedCovers.back);
  const step3Ready = Boolean(form.genreIds.length && form.formatId);

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
        setForm(emptyMovieForm);
        setUploadedCovers({});
        setFrontCover(null);
        setBackCover(null);
        setEditingEditionId(null);
        setMovieEditions([]);
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
        // ⚡ Bolt: Fetch only the target movie by ID instead of downloading the entire catalog
        const response = await fetch(`${API_BASE}/movies/${encodeURIComponent(movieId)}`);
        if (response.status === 404) throw new Error('This movie was not found in the collection.');
        if (!response.ok) throw new Error('Could not load the collection entry for editing.');
        const movie = await response.json() as Movie;
        const requestedEdition = searchParams.get('editionId');
        const requestedEditionId = requestedEdition ? Number(requestedEdition) : null;
        const edition = requestedEditionId
          ? movie.editions?.find((item) => item.id === requestedEditionId)
          : movie.editions?.[0];
        if (requestedEditionId && !edition) throw new Error('The selected edition was not found for this movie.');
        if (!edition) throw new Error('This movie has no physical edition to edit.');
        if (cancelled) return;

        setEditingEditionId(edition.id);
        setMovieEditions(movie.editions || []);
        setForm({
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

  const updateForm = useCallback((field: string, value: string | boolean | string[]) => {
    setForm((current) => (current[field as keyof typeof current] === value ? current : { ...current, [field]: value }));
  }, []);

  const handleCoverSelected = useCallback(async (slot: 'front' | 'back', file: File | null) => {
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
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
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
  }, []);

  const handleFrontCoverChange = useCallback((file: File | null) => {
    void handleCoverSelected('front', file);
  }, [handleCoverSelected]);

  const handleBackCoverChange = useCallback((file: File | null) => {
    void handleCoverSelected('back', file);
  }, [handleCoverSelected]);

  const handleFrontCoverRetry = useCallback(() => {
    void handleCoverSelected('front', frontCover);
  }, [handleCoverSelected, frontCover]);

  const handleBackCoverRetry = useCallback(() => {
    void handleCoverSelected('back', backCover);
  }, [handleCoverSelected, backCover]);

  const handleRotateCover = useCallback(async (slot: 'front' | 'back') => {
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
  }, [handleCoverSelected, uploadedCovers]);

  const handleFrontCoverRotate = useCallback(() => {
    void handleRotateCover('front');
  }, [handleRotateCover]);

  const handleBackCoverRotate = useCallback(() => {
    void handleRotateCover('back');
  }, [handleRotateCover]);

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
      const response = await fetch(`${API_BASE}/barcode/read`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: data,
      });
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

      updateForm('barcode', result.barcode);
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
    const barcode = (barcodeReference ?? form.barcode).trim();
    const lookupQueries = Array.from(new Set([
      form.title.trim(),
      form.originalTitle.trim(),
    ].filter(Boolean)));

    if (!lookupQueries.length && !barcode) {
      setStatusMessage('Enter a movie title or barcode before looking up metadata.');
      return;
    }

    setIsLookingUpMetadata(true);
    setAppliedResultKey(null);
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

  const applyMetadata = (result: SearchResult, resultKey?: string) => {
    const year = result.release_date || result.releaseDate || '';
    const parsedYear = year ? String(year).slice(0, 4) : '';
    const safeImdbId = result.imdb_id && /^tt\d{1,12}$/i.test(result.imdb_id) ? result.imdb_id : null;
    const safeTmdbNumericId = result.id && /^\d+$/.test(String(result.id)) ? String(result.id) : null;

    setForm((current) => ({
      ...current,
      title: result.title || current.title,
      originalTitle: result.original_title || result.originalTitle || current.originalTitle,
      releaseYear: parsedYear || current.releaseYear,
      releaseDate: year || current.releaseDate,
      synopsis: result.overview || current.synopsis,
      imdbId: safeImdbId || current.imdbId,
      tmdbId: result.tmdbId || safeTmdbNumericId || current.tmdbId,
      imdbUrl: safeImdbId ? `https://www.imdb.com/title/${safeImdbId}/` : current.imdbUrl,
      tmdbUrl: result.tmdbUrl || (safeTmdbNumericId ? `https://www.themoviedb.org/movie/${safeTmdbNumericId}` : current.tmdbUrl),
      posterPath: result.poster_path && result.poster_path !== 'N/A'
        ? result.poster_path.startsWith('http')
          ? result.poster_path
          : result.poster_path.startsWith('/') && !result.poster_path.startsWith('//')
            ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
            : current.posterPath
        : current.posterPath,
    }));

    setAppliedResultKey(resultKey || null);
    setStatusMessage(`Metadata from ${result.source || 'source'} applied to the entry.`);
  };

  const handleIdentificationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!isLookingUpMetadata && !isReadingBarcode) {
        void handleLookupMetadata();
      }
    }
  };

  const resetIntake = () => {
    setForm(emptyMovieForm);
    setUploadedCovers({});
    setFrontCover(null);
    setBackCover(null);
    setCoverUploadStatus({});
    setBarcodeScanStatus(null);
    setSearchResults([]);
    setAppliedResultKey(null);
    setStatusMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
      ...form,
      releaseYear: Number(form.releaseYear) || null,
      editionYear: Number(form.editionYear) || null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      favorite: Boolean(form.favorite),
      genreIds: form.genreIds,
      steelbook: Boolean(form.steelbook),
      slipcover: Boolean(form.slipcover),
      digibook: Boolean(form.digibook),
      booklet: Boolean(form.booklet),
      posterIncluded: Boolean(form.posterIncluded),
      ...(uploadedCovers.front ? { frontCoverPath: uploadedCovers.front.path } : {}),
      ...(uploadedCovers.back ? { backCoverPath: uploadedCovers.back.path } : {}),
    };

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `${API_BASE}/movies/${movieId}` : `${API_BASE}/ingest`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
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
      setForm(emptyMovieForm);
      setUploadedCovers({});
      setCoverUploadStatus({});
      setBarcodeScanStatus(null);
      setAppliedResultKey('');
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
        <Typography variant="h4" component="h1" sx={{ mb: 2, fontWeight: 800 }}>
          {isEditing ? `Edit ${form.title || 'movie'}` : 'Capture and catalog a physical movie'}
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          {isEditing
            ? 'Update the movie and selected physical edition. Existing cover photos are kept unless you replace them.'
            : 'Identify the movie with its barcode or title, review live metadata, then add its cover photos and edition details before saving.'}
        </Alert>

        {isEditing && movieEditions.length > 1 && (
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Editions for this movie ({movieEditions.length})
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {movieEditions.map((ed) => {
                const isCurrent = ed.id === editingEditionId;
                const label = `${editionFormatLabel(ed.formatId)}${ed.editionYear ? ` · ${ed.editionYear}` : ''}${ed.barcode ? ` · ${ed.barcode}` : ''}`;
                return (
                  <Chip
                    key={ed.id}
                    label={label}
                    clickable={!isCurrent}
                    color={isCurrent ? 'primary' : 'default'}
                    variant={isCurrent ? 'filled' : 'outlined'}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => {
                      if (!isCurrent) {
                        navigate(`/edit-movie/${movieId}?editionId=${ed.id}`);
                      }
                    }}
                  />
                );
              })}
            </Stack>
          </Paper>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>1. Identify the movie</Typography>
              {step1Ready && <Chip size="small" color="success" variant="outlined" label="Ready ✓" />}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Scan the package barcode or search by title. Review a matching catalog/API result before adding photos.
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Movie title"
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  onKeyDown={handleIdentificationKeyDown}
                  required
                  InputProps={{
                    endAdornment: form.title ? (
                      <InputAdornment position="end">
                        <Tooltip title="Clear movie title">
                          <IconButton aria-label="Clear movie title" onClick={() => updateForm('title', '')} edge="end" size="small">
                            <ClearRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Original title"
                  value={form.originalTitle}
                  onChange={(event) => updateForm('originalTitle', event.target.value)}
                  onKeyDown={handleIdentificationKeyDown}
                  InputProps={{
                    endAdornment: form.originalTitle ? (
                      <InputAdornment position="end">
                        <Tooltip title="Clear original title">
                          <IconButton aria-label="Clear original title" onClick={() => updateForm('originalTitle', '')} edge="end" size="small">
                            <ClearRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </Grid>
              <Grid item xs={12} md={5}>
                <TextField
                  fullWidth
                  label="Barcode"
                  value={form.barcode}
                  onChange={(event) => updateForm('barcode', event.target.value)}
                  onKeyDown={handleIdentificationKeyDown}
                  helperText={form.barcode ? (isBarcodeValid ? 'Retail barcode check digit is valid.' : 'Check the digits; checksum validation does not recognize this as a standard retail code.') : 'Scan the barcode on the packaging or enter it manually.'}
                  InputProps={{
                    endAdornment: form.barcode ? (
                      <InputAdornment position="end">
                        <Tooltip title="Clear barcode">
                          <IconButton aria-label="Clear barcode" onClick={() => updateForm('barcode', '')} edge="end" size="small">
                            <ClearRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
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
              <Alert role="status" aria-live="polite" severity={getStatusSeverity(statusMessage)} sx={{ mt: 2 }}>
                {statusMessage}
              </Alert>
            )}
            {searchResults.length > 0 && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>Review metadata matches</Typography>
                {sortedSearchResults.map((result, index) => {
                  const resultKey = `${result.source || 'meta'}-${result.id || result.imdb_id || result.title}-${index}`;
                  const isApplied = appliedResultKey === resultKey;
                  return (
                    <Paper
                      key={resultKey}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        background: 'rgba(18,28,46,0.9)',
                        border: isApplied ? '1px solid #8ab4ff' : '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
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
                        <Button
                          variant={isApplied ? 'contained' : 'outlined'}
                          aria-pressed={isApplied}
                          onClick={() => applyMetadata(result, resultKey)}
                          sx={{ alignSelf: { md: 'center' }, flexShrink: 0 }}
                        >
                          {isApplied ? 'Applied ✓' : 'Use metadata'}
                        </Button>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>2. Add cover photos</Typography>
              {step2Ready && <Chip size="small" color="success" variant="outlined" label="Ready ✓" />}
            </Stack>
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
                onChange={handleFrontCoverChange}
                onRetry={handleFrontCoverRetry}
                onRotate={handleFrontCoverRotate}
              />
              <UploadField
                label="Back cover"
                value={backCover}
                uploading={uploadingCovers.back}
                uploaded={Boolean(uploadedCovers.back)}
                uploadedPath={uploadedCovers.back?.path}
                uploadStatus={coverUploadStatus.back}
                rotating={Boolean(rotatingCovers.back)}
                onChange={handleBackCoverChange}
                onRetry={handleBackCoverRetry}
                onRotate={handleBackCoverRotate}
              />
            </Stack>
          </Paper>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>3. Confirm edition details and save</Typography>
            {step3Ready && <Chip size="small" color="success" variant="outlined" label="Ready ✓" />}
          </Stack>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight={700}>Movie details</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!genres.length || Boolean(genreError)}>
                <InputLabel id="movie-genres-label">Genres</InputLabel>
                <Select
                  labelId="movie-genres-label"
                  multiple
                  label="Genres"
                  value={form.genreIds}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateForm('genreIds', typeof value === 'string' ? value.split(',') : value);
                  }}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((id) => <Chip key={id} label={genreNameMap.get(id) || id} size="small" />)}
                    </Box>
                  )}
                >
                  {genres.map((genre) => (
                    <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {genreError && <Alert severity="error" sx={{ mt: 1 }}>{genreError}</Alert>}
              {!genreError && !genres.length && <Typography variant="caption" color="text.secondary">Loading genres...</Typography>}
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Alternative title" value={form.alternativeTitle} onChange={(event) => updateForm('alternativeTitle', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <NameOptionField
                label="Movie country"
                field="countryId"
                value={form.countryId}
                options={countryOptions}
                helperText="Search by country name, or type a country."
                onFieldChange={updateForm}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <NameOptionField
                label="Original language"
                field="originalLanguageId"
                value={form.originalLanguageId}
                options={languageOptions}
                helperText="Search by language name, or type a language."
                onFieldChange={updateForm}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Release year" type="number" value={form.releaseYear} onChange={(event) => updateForm('releaseYear', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Release date" type="date" InputLabelProps={{ shrink: true }} value={form.releaseDate} onChange={(event) => updateForm('releaseDate', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <SuggestionField label="Age rating" field="ageRating" value={form.ageRating} options={ageRatingOptions} onFieldChange={updateForm} />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={<Checkbox checked={form.favorite} onChange={(event) => updateForm('favorite', event.target.checked)} />}
                label="Favorite"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={3} label="Synopsis" value={form.synopsis} onChange={(event) => updateForm('synopsis', event.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Movie notes" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 1 }}>Physical edition</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Edition year" type="number" value={form.editionYear} onChange={(event) => updateForm('editionYear', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Catalog number" value={form.catalogNumber} onChange={(event) => updateForm('catalogNumber', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Disc count" type="number" value={form.discCount} onChange={(event) => updateForm('discCount', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel id="add-movie-format-label">Format</InputLabel>
                <Select labelId="add-movie-format-label" id="add-movie-format-select" label="Format" value={form.formatId} onChange={(event) => updateForm('formatId', event.target.value)}>
                  {formatOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel id="add-movie-edition-type-label">Edition type</InputLabel>
                <Select labelId="add-movie-edition-type-label" id="add-movie-edition-type-select" label="Edition type" value={form.editionTypeId} onChange={(event) => updateForm('editionTypeId', event.target.value)}>
                  {editionTypeOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel id="add-movie-watched-label">Watched status</InputLabel>
                <Select labelId="add-movie-watched-label" id="add-movie-watched-select" label="Watched status" value={form.watchedStatus} onChange={(event) => updateForm('watchedStatus', event.target.value)}>
                  {watchedOptions.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <SuggestionField label="Condition" field="condition" value={form.condition} options={conditionOptions} onFieldChange={updateForm} />
            </Grid>
            <Grid item xs={12} md={3}>
              <NameOptionField
                label="Edition country"
                field="countryEditionId"
                value={form.countryEditionId}
                options={countryOptions}
                helperText="Country where this edition was released."
                onFieldChange={updateForm}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Distributor" placeholder="e.g. Warner Bros." value={form.distributorId} onChange={(event) => updateForm('distributorId', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <SuggestionField label="Movie version" field="movieVersionId" value={form.movieVersionId} options={movieVersionOptions} onFieldChange={updateForm} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Collection name" placeholder="e.g. Sci-fi shelf" value={form.collectionId} onChange={(event) => updateForm('collectionId', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Storage location" placeholder="e.g. Living room · Shelf 2" value={form.locationId} onChange={(event) => updateForm('locationId', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <SuggestionField label="DVD / Blu-ray region" field="region" value={form.region} options={regionOptions} onFieldChange={updateForm} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Purchase price" type="number" value={form.purchasePrice} onChange={(event) => updateForm('purchasePrice', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Estimated value" type="number" value={form.estimatedValue} onChange={(event) => updateForm('estimatedValue', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                Packaging &amp; inclusions
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {([
                  ['steelbook', 'Steelbook'],
                  ['slipcover', 'Slipcover'],
                  ['digibook', 'Digibook'],
                  ['booklet', 'Booklet'],
                  ['posterIncluded', 'Poster included'],
                ] as const).map(([field, label]) => (
                  <FormControlLabel
                    key={field}
                    control={
                      <Checkbox
                        checked={Boolean(form[field])}
                        onChange={(event) => updateForm(field, event.target.checked)}
                      />
                    }
                    label={label}
                  />
                ))}
              </Stack>
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
                      <TextField fullWidth label="IMDb title ID" placeholder="e.g. tt0133093" value={form.imdbId} onChange={(event) => updateForm('imdbId', event.target.value)} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField fullWidth label="IMDb link" placeholder="https://www.imdb.com/title/..." value={form.imdbUrl} onChange={(event) => updateForm('imdbUrl', event.target.value)} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField fullWidth label="TMDb link" placeholder="https://www.themoviedb.org/movie/..." value={form.tmdbUrl} onChange={(event) => updateForm('tmdbUrl', event.target.value)} />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Edition notes" value={form.editionNotes} onChange={(event) => updateForm('editionNotes', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                type="date"
                label="Watched date"
                InputLabelProps={{ shrink: true }}
                value={form.watchedDate}
                onChange={(event) => updateForm('watchedDate', event.target.value)}
              />
              {!form.watchedDate ? (
                <Button
                  size="small"
                  onClick={() => {
                    const now = new Date();
                    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    updateForm('watchedDate', localDate);
                  }}
                  sx={{ mt: 0.5 }}
                >
                  Set to today
                </Button>
              ) : (
                <Button
                  size="small"
                  onClick={() => updateForm('watchedDate', '')}
                  sx={{ mt: 0.5 }}
                >
                  Clear date
                </Button>
              )}
            </Grid>
          </Grid>

          {statusMessage && (
            <Alert role="status" aria-live="polite" severity={getStatusSeverity(statusMessage)} sx={{ mt: 3 }}>
              {statusMessage}
            </Alert>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
            <Button type="submit" variant="contained" size="large" disabled={isSaving || !genres.length || Boolean(genreError) || (isEditing && !editingEditionId) || uploadingCovers.front || uploadingCovers.back || rotatingCovers.front || rotatingCovers.back} startIcon={isSaving ? <CircularProgress size={18} /> : undefined}>
              {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Save to collection'}
            </Button>
            {isEditing
              ? <Button variant="outlined" size="large" onClick={() => navigate('/collection')}>Cancel</Button>
              : <Button variant="outlined" size="large" onClick={() => setConfirmResetOpen(true)}>Reset form</Button>}
          </Stack>
          {(uploadingCovers.front || uploadingCovers.back || rotatingCovers.front || rotatingCovers.back || !genres.length) && !isSaving && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {uploadingCovers.front || uploadingCovers.back
                ? 'Wait for cover photo uploads to finish before saving.'
                : rotatingCovers.front || rotatingCovers.back
                  ? 'Wait for cover rotation to finish before saving.'
                  : genreError
                    ? 'Genres could not be loaded; saving is unavailable.'
                    : 'Loading genres before saving is enabled...'}
            </Typography>
          )}
        </Box>
      </Paper>

      <Dialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        aria-labelledby="confirm-reset-title"
      >
        <DialogTitle id="confirm-reset-title">Reset movie intake form?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will clear all entered fields, metadata search results, and attached cover previews.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetOpen(false)}>Keep editing</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              resetIntake();
              setConfirmResetOpen(false);
            }}
          >
            Reset form
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
