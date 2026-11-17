import { z } from 'zod';

const normalizeOptionalNumericInput = (val) => {
  if (val === '' || val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return NaN;
  if (typeof val === 'string' && val.trim() === '') return undefined;
  return Number(val);
};

const optionalWholeNumber = (label, max) => z.preprocess(
  normalizeOptionalNumericInput,
  z.number({
    invalid_type_error: `${label} must be a non-negative whole number.`,
  })
    .int({ message: `${label} must be a non-negative whole number.` })
    .min(0, { message: `${label} must be a non-negative whole number.` })
    .max(max, { message: `${label} must be at most ${max}.` })
    .optional()
    .nullable(),
);

const optionalAmount = (label, max) => z.preprocess(
  normalizeOptionalNumericInput,
  z.number({
    invalid_type_error: `${label} must be a non-negative amount.`,
  })
    .finite({ message: `${label} must be a non-negative amount.` })
    .min(0, { message: `${label} must be a non-negative amount.` })
    .max(max, { message: `${label} must be at most ${max}.` })
    .optional()
    .nullable(),
);

const textIdentifier = (field) => z
  .string({ invalid_type_error: `${field} must be a text identifier.` })
  .trim()
  .max(64)
  .optional()
  .nullable();

const optionalBoolean = (field) => z
  .boolean({ invalid_type_error: `${field} must be a boolean value.` })
  .optional();

const SAFE_UPLOAD_PATH_REGEX = /^\/uploads\/(?!\.\.?$)[^/\\]+$/;

const coverPathSchema = z
  .string()
  .trim()
  .max(255)
  .refine((val) => val === '' || SAFE_UPLOAD_PATH_REGEX.test(val), {
    message: 'Cover path must reference an uploaded cover image.',
  })
  .optional()
  .nullable();

const isPrivateOrLoopbackHost = (rawHostname) => {
  const host = String(rawHostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host === '::1'
    || host === '::'
  ) {
    return true;
  }
  if (
    host.includes(':')
    && (
      host.startsWith('::ffff:')
      || host.startsWith('fe80:')
      || host.startsWith('fc')
      || host.startsWith('fd')
      || host.startsWith('ff')
    )
  ) {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return true;
    }
    const [a, b] = octets;
    if (
      a === 0
      || a === 10
      || (a === 100 && b >= 64 && b <= 127)
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224
    ) {
      return true;
    }
  }
  return false;
};

export const isSafeHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    return !isPrivateOrLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
};

export const isSafeHttpsUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return false;
    }
    return !isPrivateOrLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
};

const safeUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((val) => val === '' || isSafeHttpUrl(val), {
    message: 'URL must use http or https.',
  })
  .optional()
  .nullable();

const safePosterSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((val) => val === '' || isSafeHttpUrl(val) || SAFE_UPLOAD_PATH_REGEX.test(val), {
    message: 'posterPath must be an HTTP/HTTPS URL or uploaded image.',
  })
  .optional()
  .nullable();

export const ingestMovieSchema = z.object({
  title: z.string({
    required_error: 'A movie title is required.',
    invalid_type_error: 'title must be a text value.',
  }).trim().min(1, 'A movie title is required.').max(300),
  originalTitle: z.string().trim().max(300).optional().nullable(),
  alternativeTitle: z.string().trim().max(300).optional().nullable(),
  releaseYear: optionalWholeNumber('Release year', 9999),
  releaseDate: z.string().trim().max(64).optional().nullable(),
  countryId: textIdentifier('countryId'),
  durationMinutes: optionalWholeNumber('Duration', 10000),
  synopsis: z.string().trim().max(10000).optional().nullable(),
  originalLanguageId: textIdentifier('originalLanguageId'),
  ageRating: z.string().trim().max(64).optional().nullable(),
  personalRating: optionalWholeNumber('Personal rating', 10),
  favorite: optionalBoolean('favorite'),
  watchedStatus: z.string().trim().max(64).optional().nullable().default('unwatched'),
  watchedDate: z.string().trim().max(64).optional().nullable(),
  rewatchFlag: optionalBoolean('rewatchFlag'),
  notes: z.string().trim().max(10000).optional().nullable(),
  posterPath: safePosterSchema,
  imdbId: z.string().trim().max(64).optional().nullable(),
  tmdbId: z.string().trim().max(64).optional().nullable(),
  imdbUrl: safeUrlSchema,
  tmdbUrl: safeUrlSchema,
  genreIds: z.array(
    z.string({ invalid_type_error: 'genreIds must be an array of genre identifiers.' }).max(64),
    { invalid_type_error: 'genreIds must be an array of genre identifiers.' },
  ).max(50).optional().default([]),

  formatId: textIdentifier('formatId'),
  editionTypeId: textIdentifier('editionTypeId'),
  movieVersionId: textIdentifier('movieVersionId'),
  distributorId: textIdentifier('distributorId'),
  countryEditionId: textIdentifier('countryEditionId'),
  editionYear: optionalWholeNumber('Edition year', 9999),
  region: z.string().trim().max(64).optional().nullable(),
  barcode: z.string().trim().max(64).optional().nullable(),
  catalogNumber: z.string().trim().max(128).optional().nullable(),
  steelbook: optionalBoolean('steelbook'),
  slipcover: optionalBoolean('slipcover'),
  digibook: optionalBoolean('digibook'),
  booklet: optionalBoolean('booklet'),
  posterIncluded: optionalBoolean('posterIncluded'),
  discCount: optionalWholeNumber('Disc count', 1000),
  condition: z.string().trim().max(64).optional().nullable(),
  purchaseDate: z.string().trim().max(64).optional().nullable(),
  purchasePrice: optionalAmount('Purchase price', 1000000),
  estimatedValue: optionalAmount('Estimated value', 1000000),
  locationId: textIdentifier('locationId'),
  collectionId: textIdentifier('collectionId'),
  frontCoverPath: coverPathSchema,
  backCoverPath: coverPathSchema,
  spineImagePath: coverPathSchema,
  editionNotes: z.string().trim().max(10000).optional().nullable(),
});

export const updateMovieSchema = ingestMovieSchema.extend({
  editionId: z.preprocess((val) => Number(val), z.number().int().min(1, 'A valid edition is required.')),
});
