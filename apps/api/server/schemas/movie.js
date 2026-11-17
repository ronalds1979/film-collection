import { z } from 'zod';

const optionalNumber = (schema) => z.preprocess(
  (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
  schema.optional().nullable(),
);

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
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '::') {
    return true;
  }
  if (host.startsWith('::ffff:') || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
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
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
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
  title: z.string().trim().min(1, 'A movie title is required.').max(300),
  originalTitle: z.string().trim().max(300).optional().nullable(),
  alternativeTitle: z.string().trim().max(300).optional().nullable(),
  releaseYear: optionalNumber(z.number().int().min(0).max(9999)),
  releaseDate: z.string().trim().max(64).optional().nullable(),
  countryId: z.string().trim().max(64).optional().nullable(),
  durationMinutes: optionalNumber(z.number().int().min(0).max(10000)),
  synopsis: z.string().trim().max(10000).optional().nullable(),
  originalLanguageId: z.string().trim().max(64).optional().nullable(),
  ageRating: z.string().trim().max(64).optional().nullable(),
  personalRating: optionalNumber(z.number().int().min(0).max(10)),
  favorite: z.boolean().optional(),
  watchedStatus: z.string().trim().max(64).optional().nullable().default('unwatched'),
  watchedDate: z.string().trim().max(64).optional().nullable(),
  rewatchFlag: z.boolean().optional(),
  notes: z.string().trim().max(10000).optional().nullable(),
  posterPath: safePosterSchema,
  imdbId: z.string().trim().max(64).optional().nullable(),
  tmdbId: z.string().trim().max(64).optional().nullable(),
  imdbUrl: safeUrlSchema,
  tmdbUrl: safeUrlSchema,
  genreIds: z.array(z.string().max(64)).max(50).optional().default([]),

  formatId: z.string().trim().max(64).optional().nullable(),
  editionTypeId: z.string().trim().max(64).optional().nullable(),
  movieVersionId: z.string().trim().max(64).optional().nullable(),
  distributorId: z.string().trim().max(64).optional().nullable(),
  countryEditionId: z.string().trim().max(64).optional().nullable(),
  editionYear: optionalNumber(z.number().int().min(0).max(9999)),
  region: z.string().trim().max(64).optional().nullable(),
  barcode: z.string().trim().max(64).optional().nullable(),
  catalogNumber: z.string().trim().max(128).optional().nullable(),
  steelbook: z.boolean().optional(),
  slipcover: z.boolean().optional(),
  digibook: z.boolean().optional(),
  booklet: z.boolean().optional(),
  posterIncluded: z.boolean().optional(),
  discCount: optionalNumber(z.number().int().min(0).max(1000)),
  condition: z.string().trim().max(64).optional().nullable(),
  purchaseDate: z.string().trim().max(64).optional().nullable(),
  purchasePrice: optionalNumber(z.number().min(0).max(1000000)),
  estimatedValue: optionalNumber(z.number().min(0).max(1000000)),
  locationId: z.string().trim().max(64).optional().nullable(),
  collectionId: z.string().trim().max(64).optional().nullable(),
  frontCoverPath: coverPathSchema,
  backCoverPath: coverPathSchema,
  spineImagePath: coverPathSchema,
  editionNotes: z.string().trim().max(10000).optional().nullable(),
});

export const updateMovieSchema = ingestMovieSchema.extend({
  editionId: z.preprocess((val) => Number(val), z.number().int().min(1, 'A valid edition is required.')),
});
