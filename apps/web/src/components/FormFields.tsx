import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, FormControl, InputLabel, ListItemText, MenuItem, Select, SelectChangeEvent, Stack, TextField, Typography, Alert } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import { CoverUploadStatus, Genre } from '../types';

type NamedOption = { id: string; name: string };
type LabeledOption = { id: string; label: string };

// ⚡ Bolt: Memoize static Select controls (Format, Edition type, Watched status) so typing in
// unrelated AddMovie text fields skips re-rendering 3 MUI Select trees and their MenuItems per keystroke.
export const OptionSelectField = memo(function OptionSelectField({
  labelId,
  selectId,
  label,
  field,
  value,
  options,
  onFieldChange,
}: {
  labelId: string;
  selectId: string;
  label: string;
  field: string;
  value: string;
  options: LabeledOption[];
  onFieldChange: (field: string, value: string) => void;
}) {
  const handleChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      onFieldChange(field, event.target.value);
    },
    [field, onFieldChange],
  );

  return (
    <FormControl fullWidth>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select labelId={labelId} id={selectId} label={label} value={value} onChange={handleChange}>
        {options.map((option) => (
          <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
});

// ⚡ Bolt: Memoize the multi-select genres control and index selected IDs in a Set so typing
// in unrelated AddMovie fields skips re-rendering 18 MenuItem/Checkbox subtrees per keystroke.
export const GenreSelectField = memo(function GenreSelectField({
  genres,
  selectedGenreIds,
  genreError,
  onFieldChange,
}: {
  genres: Genre[];
  selectedGenreIds: string[];
  genreError: string | null;
  onFieldChange: (field: string, value: string[]) => void;
}) {
  const genresDisabled = !genres.length || Boolean(genreError);
  const genreNameMap = useMemo(
    () => new Map(genres.map((genre) => [genre.id, genre.name])),
    [genres],
  );
  const selectedGenreSet = useMemo(() => new Set(selectedGenreIds), [selectedGenreIds]);

  const handleChange = useCallback((event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    onFieldChange('genreIds', typeof value === 'string' ? value.split(',') : value);
  }, [onFieldChange]);

  return (
    <>
      <FormControl fullWidth disabled={genresDisabled}>
        <InputLabel id="movie-genres-label">Genres</InputLabel>
        <Select
          labelId="movie-genres-label"
          multiple
          label="Genres"
          value={selectedGenreIds}
          onChange={handleChange}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((id) => (
                <Chip
                  key={id}
                  label={genreNameMap.get(id) || id}
                  size="small"
                  onMouseDown={genresDisabled ? undefined : (event) => event.stopPropagation()}
                  onDelete={genresDisabled ? undefined : () => onFieldChange('genreIds', selectedGenreIds.filter((genreId) => genreId !== id))}
                />
              ))}
            </Box>
          )}
        >
          {genres.map((genre) => (
            <MenuItem key={genre.id} value={genre.id}>
              <Checkbox checked={selectedGenreSet.has(genre.id)} size="small" />
              <ListItemText primary={genre.name} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {genreError && <Alert severity="error" sx={{ mt: 1 }}>{genreError}</Alert>}
      {!genreError && !genres.length && <Typography variant="caption" color="text.secondary">Loading genres...</Typography>}
    </>
  );
});

export const NameOptionField = memo(function NameOptionField({ label, value, options, helperText, field, onChange, onFieldChange }: {
  label: string;
  value: string;
  options: NamedOption[];
  helperText: string;
  field?: string;
  onChange?: (value: string) => void;
  onFieldChange?: (field: string, value: string) => void;
}) {
  const selectedOption = useMemo(
    () => options.find((option) => option.id === value || option.name === value),
    [options, value],
  );

  const emitChange = (nextValue: string) => {
    if (field && onFieldChange) {
      onFieldChange(field, nextValue);
    } else {
      onChange?.(nextValue);
    }
  };

  return (
    <Autocomplete<NamedOption, false, false, true>
      freeSolo
      options={options}
      value={selectedOption || (value || null)}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      isOptionEqualToValue={(option, selected) => typeof selected !== 'string' && option.id === selected.id}
      onChange={(_event, selection) => {
        emitChange(typeof selection === 'string' ? selection : selection?.id || '');
      }}
      onInputChange={(_event, input, reason) => {
        if (reason === 'input' || reason === 'clear') emitChange(input);
      }}
      renderInput={(params) => <TextField {...params} label={label} helperText={helperText} />}
    />
  );
});

export const SuggestionField = memo(function SuggestionField({ label, value, options, field, onChange, onFieldChange }: {
  label: string;
  value: string;
  options: string[];
  field?: string;
  onChange?: (value: string) => void;
  onFieldChange?: (field: string, value: string) => void;
}) {
  const emitChange = (nextValue: string) => {
    if (field && onFieldChange) {
      onFieldChange(field, nextValue);
    } else {
      onChange?.(nextValue);
    }
  };

  return (
    <Autocomplete<string, false, false, true>
      freeSolo
      options={options}
      value={value || null}
      onChange={(_event, selection) => emitChange(selection || '')}
      onInputChange={(_event, input, reason) => {
        if (reason === 'input' || reason === 'clear') emitChange(input);
      }}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
});

export const UploadField = memo(function UploadField({ label, value, uploading, uploaded, uploadedPath, uploadStatus, rotating, onChange, onRetry, onRotate }: {
  label: string;
  value: File | null;
  uploading: boolean;
  uploaded: boolean;
  uploadedPath?: string;
  uploadStatus?: CoverUploadStatus;
  rotating: boolean;
  onChange: (file: File | null) => void;
  onRetry: () => void;
  onRotate: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || rotating;
  return (
    <Box sx={{ minWidth: { xs: '100%', md: 220 }, flex: 1 }}>
      <Stack spacing={1}>
        <input
          ref={captureInputRef}
          hidden
          type="file"
          accept="image/*"
          capture="environment"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            event.currentTarget.value = '';
            if (file) {
              setDropError(null);
              onChange(file);
            }
          }}
        />
        <input
          ref={galleryInputRef}
          hidden
          type="file"
          accept="image/*"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            event.currentTarget.value = '';
            if (file) {
              setDropError(null);
              onChange(file);
            }
          }}
        />
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => captureInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!busy) setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (busy) return;
            const file = event.dataTransfer.files?.[0] || null;
            if (!file) return;
            if (file.type.startsWith('image/')) {
              setDropError(null);
              onChange(file);
            } else {
              setDropError(`"${file.name}" is not a supported image file.`);
            }
          }}
          sx={{
            width: '100%',
            py: 2.5,
            borderStyle: 'dashed',
            borderRadius: 3,
            borderColor: isDragging ? '#8ab4ff' : undefined,
            backgroundColor: isDragging ? 'rgba(138,180,255,0.12)' : undefined,
          }}
          startIcon={busy ? <CircularProgress size={18} /> : <PhotoCamera />}
        >
          {isDragging
            ? `Drop ${label.toLowerCase()} here`
            : uploading
              ? `Preparing ${label.toLowerCase()}...`
              : rotating
                ? `Rotating ${label.toLowerCase()}...`
                : `Capture ${label.toLowerCase()}`}
        </Button>
        <Button
          variant="text"
          disabled={busy}
          onClick={() => galleryInputRef.current?.click()}
          sx={{ width: '100%' }}
        >
          Choose {label.toLowerCase()} from photos
        </Button>
      </Stack>
      {value && !uploading && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, textAlign: 'center', overflowWrap: 'anywhere' }}>
          {value.name}
        </Typography>
      )}
      <Typography variant="caption" color={uploaded ? 'success.main' : 'text.secondary'} sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}>
        {uploading ? 'Preparing and saving the photo...' : uploaded ? 'Saved on the catalog server · ready to include' : 'Capture, choose, or drag & drop a photo to include with this edition'}
      </Typography>
      {dropError && (
        <Alert severity="error" role="alert" sx={{ mt: 1, py: 0, overflowWrap: 'anywhere' }}>
          {dropError}
        </Alert>
      )}
      {uploadStatus && (
        <Alert severity={uploadStatus.severity} role="status" aria-live="polite" sx={{ mt: 1, py: 0, overflowWrap: 'anywhere' }}>
          {uploadStatus.message}
        </Alert>
      )}
      {uploadStatus?.severity === 'error' && value && (
        <Button fullWidth size="small" onClick={onRetry} sx={{ mt: 0.5 }}>
          Retry {label.toLowerCase()} upload
        </Button>
      )}
      {uploadedPath && (
        <>
          <Button
            fullWidth
            size="small"
            disabled={busy}
            startIcon={rotating ? <CircularProgress size={16} /> : <RotateRightRounded />}
            onClick={onRotate}
            sx={{ mt: 0.5 }}
          >
            {rotating ? 'Rotating and saving...' : 'Rotate 180°'}
          </Button>
          <Box
            component="img"
            src={uploadedPath}
            alt={`${label} saved preview`}
            sx={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 2, mt: 1, background: 'rgba(0,0,0,0.2)' }}
          />
        </>
      )}
    </Box>
  );
});
