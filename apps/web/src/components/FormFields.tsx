import { memo, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, CircularProgress, Stack, TextField, Typography, Alert } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import { CoverUploadStatus } from '../types';

type NamedOption = { id: string; name: string };

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
  const busy = uploading || rotating;
  return (
    <Box sx={{ minWidth: { xs: '100%', md: 220 }, flex: 1 }}>
      <Stack spacing={1}>
        <Button
          component="label"
          variant="outlined"
          disabled={busy}
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
            if (file && file.type.startsWith('image/')) {
              onChange(file);
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
          {uploading ? `Preparing ${label.toLowerCase()}...` : rotating ? `Rotating ${label.toLowerCase()}...` : `Capture ${label.toLowerCase()}`}
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              event.currentTarget.value = '';
              if (file) {
                onChange(file);
              }
            }}
          />
        </Button>
        <Button
          component="label"
          variant="text"
          disabled={busy}
          sx={{ width: '100%' }}
        >
          Choose {label.toLowerCase()} from photos
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              event.currentTarget.value = '';
              if (file) {
                onChange(file);
              }
            }}
          />
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
      {uploadStatus && (
        <Alert severity={uploadStatus.severity} sx={{ mt: 1, py: 0, overflowWrap: 'anywhere' }}>
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
