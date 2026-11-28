import type { UploadedCover } from '../types';

export const API_BASE = '/api';
export const baseCollator = new Intl.Collator(undefined, { sensitivity: "base" });
export const pendingCoversStorageKey = 'film-collection-pending-covers';
export const pendingCoverDatabaseName = 'film-collection-intake';
export const pendingCoverStoreName = 'pending-covers';

export const emptyMovieForm = {
  title: '',
  originalTitle: '',
  alternativeTitle: '',
  countryId: '',
  originalLanguageId: '',
  releaseYear: '',
  releaseDate: '',
  ageRating: '',
  synopsis: '',
  notes: '',
  favorite: false,
  genreIds: [] as string[],
  watchedStatus: 'unwatched',
  watchedDate: '',
  formatId: 'FMT01',
  editionTypeId: 'ED01',
  movieVersionId: '',
  distributorId: '',
  countryEditionId: '',
  locationId: '',
  collectionId: '',
  barcode: '',
  catalogNumber: '',
  editionYear: '',
  condition: 'Excellent',
  region: 'Region A',
  purchasePrice: '',
  estimatedValue: '',
  editionNotes: '',
  imdbId: '',
  tmdbId: '',
  imdbUrl: '',
  tmdbUrl: '',
  posterPath: '',
  discCount: '',
  steelbook: false,
  slipcover: false,
  digibook: false,
  booklet: false,
  posterIncluded: false,
};

export const prepareMobileImage = async (file: File, purpose: 'cover' | 'barcode') => {
  const supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  const isBrowserCompatible = supportedFormats.includes(file.type.toLowerCase());
  const fallbackMessage = purpose === 'cover'
    ? 'Choose a JPEG photo, or change the phone camera setting to JPEG/Most Compatible and capture the cover again.'
    : 'Choose a JPEG photo or reduce camera resolution and try again.';

  if (typeof createImageBitmap !== 'function') {
    if (!isBrowserCompatible || file.size > 18 * 1024 * 1024) {
      throw new Error(`This camera photo is too large or uses a format this browser cannot prepare. ${fallbackMessage}`);
    }
    return file;
  }

  let imageSource: CanvasImageSource;
  let imageWidth: number;
  let imageHeight: number;
  let releaseImage = () => {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    imageSource = bitmap;
    imageWidth = bitmap.width;
    imageHeight = bitmap.height;
    releaseImage = () => bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      imageSource = image;
      imageWidth = image.naturalWidth;
      imageHeight = image.naturalHeight;
      releaseImage = () => URL.revokeObjectURL(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw new Error(`The camera photo format (${file.type || 'unknown'}) could not be opened. ${fallbackMessage}`);
    }
  }

  try {
    if (isBrowserCompatible && file.size <= 18 * 1024 * 1024 && imageWidth * imageHeight <= 12_000_000) {
      return file;
    }

    const scale = Math.min(1, 4000 / Math.max(imageWidth, imageHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imageWidth * scale));
    canvas.height = Math.max(1, Math.round(imageHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(`Could not prepare the camera photo. ${fallbackMessage}`);
    }
    context.drawImage(imageSource, 0, 0, canvas.width, canvas.height);

    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Could not convert the camera photo to a supported format. ${fallbackMessage}`));
      }, 'image/jpeg', 0.96);
    });
    if (jpeg.size > 18 * 1024 * 1024) {
      throw new Error(`The prepared camera photo is still too large to upload. ${fallbackMessage}`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'barcode-photo';
    return new File([jpeg], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    releaseImage();
  }
};

export const rotateImage180 = async (image: Blob, filename: string) => {
  let imageSource: CanvasImageSource | undefined;
  let imageWidth = 0;
  let imageHeight = 0;
  let releaseImage = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
      imageSource = bitmap;
      imageWidth = bitmap.width;
      imageHeight = bitmap.height;
      releaseImage = () => bitmap.close();
    } catch {
      imageSource = undefined;
    }
  }
  if (!imageSource) {
    const objectUrl = URL.createObjectURL(image);
    const element = new Image();
    element.src = objectUrl;
    try {
      await element.decode();
      imageSource = element;
      imageWidth = element.naturalWidth;
      imageHeight = element.naturalHeight;
      releaseImage = () => URL.revokeObjectURL(objectUrl);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  try {
    if (!imageSource) {
      throw new Error('Could not decode the saved cover image.');
    }
    const scale = Math.min(1, 4000 / Math.max(imageWidth, imageHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imageWidth * scale));
    canvas.height = Math.max(1, Math.round(imageHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not rotate this cover in the browser.');
    }
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI);
    context.drawImage(imageSource, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);

    const rotatedImage = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create the rotated cover image.'));
      }, 'image/jpeg', 0.96);
    });
    const baseName = filename.replace(/\.[^.]+$/, '') || 'cover';
    return new File([rotatedImage], `${baseName}-rotated.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    releaseImage();
  }
};

export const withPendingCoverStore = async <T,>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => new Promise((resolve, reject) => {
  const openRequest = indexedDB.open(pendingCoverDatabaseName, 1);
  openRequest.onupgradeneeded = () => {
    openRequest.result.createObjectStore(pendingCoverStoreName);
  };
  openRequest.onerror = () => reject(openRequest.error || new Error('Could not open browser storage for the captured cover.'));
  openRequest.onsuccess = () => {
    const database = openRequest.result;
    const transaction = database.transaction(pendingCoverStoreName, mode);
    const request = operation(transaction.objectStore(pendingCoverStoreName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not access the saved camera photo.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage aborted while saving the camera photo.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  };
});

export const persistPendingCover = async (slot: 'front' | 'back', file: File) => {
  await withPendingCoverStore('readwrite', (store) => store.put(file, slot));
};

export const readPendingCovers = async (): Promise<[File | undefined, File | undefined]> => (
  // ⚡ Bolt: Read both cover slots in a single IndexedDB connection and readonly transaction
  new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(pendingCoverDatabaseName, 1);
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore(pendingCoverStoreName);
    };
    openRequest.onerror = () => reject(openRequest.error || new Error('Could not open browser storage for the captured cover.'));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction(pendingCoverStoreName, 'readonly');
      const store = transaction.objectStore(pendingCoverStoreName);
      const frontRequest = store.get('front');
      const backRequest = store.get('back');
      let front: File | undefined;
      let back: File | undefined;

      frontRequest.onsuccess = () => { front = frontRequest.result; };
      backRequest.onsuccess = () => { back = backRequest.result; };
      frontRequest.onerror = () => reject(frontRequest.error || new Error('Could not access the saved front camera photo.'));
      backRequest.onerror = () => reject(backRequest.error || new Error('Could not access the saved back camera photo.'));
      transaction.onabort = () => reject(transaction.error || new Error('Browser storage aborted while reading saved camera photos.'));
      transaction.oncomplete = () => {
        database.close();
        resolve([front, back]);
      };
      transaction.onerror = () => database.close();
    };
  })
);

export const removePendingCover = async (slot: 'front' | 'back') => {
  await withPendingCoverStore('readwrite', (store) => store.delete(slot));
};

export const coverReference = (coverPath: string): UploadedCover => ({
  filename: coverPath.split('/').pop() || '',
  path: coverPath,
});

const SAFE_UPLOAD_PATH_REGEX = /^\/uploads\/(?!\.\.?$)[^/\\]+$/;
const SAFE_TMDB_IMAGE_PATH_REGEX = /^\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i;

function isPrivateOrLoopbackHost(rawHostname: string): boolean {
  // 🛡️ Sentinel: Keep frontend SSRF host validation in parity with backend schema checks
  const host = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (
    !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
    || host === '::1' || host === '::' || /^(?:0+:){7}0*[01]$/.test(host)
  ) return true;
  if (host.includes(':')) {
    if (
      host.startsWith('::ffff:') || /^fe[89ab][0-9a-f]:/.test(host) || /^fe[c-f][0-9a-f]:/.test(host)
      || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('ff')
      || host.startsWith('64:ff9b:') || host.startsWith('100::') || host.startsWith('2002:')
      || host.startsWith('2001::') || host.startsWith('2001:0:') || host.startsWith('2001:db8:')
    ) return true;
    const ipv4Compat = host.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (ipv4Compat) {
      const hi = parseInt(ipv4Compat[1], 16);
      const lo = parseInt(ipv4Compat[2], 16);
      return isPrivateOrLoopbackHost(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    if (/^::[0-9a-f]{1,4}$/.test(host)) return true;
    const embeddedIpv4 = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (embeddedIpv4) return isPrivateOrLoopbackHost(embeddedIpv4[1]);
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

// 🛡️ Sentinel: Enforce HTTPS-only external links/posters without credentials or private/loopback targets
export function resolveSafeExternalUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return isPrivateOrLoopbackHost(parsed.hostname) ? null : parsed.toString();
  } catch { return null; }
}

/** Resolves a TMDB path, local upload path, or safe HTTPS URL into a displayable poster URL. */
export function resolvePosterUrl(posterPath?: string | null, tmdbSize: 'w185' | 'w500' = 'w500'): string {
  const trimmed = posterPath?.trim() || '';
  if (!trimmed || trimmed === 'N/A') return '';
  if (SAFE_UPLOAD_PATH_REGEX.test(trimmed)) return trimmed;
  if (SAFE_TMDB_IMAGE_PATH_REGEX.test(trimmed)) return `https://image.tmdb.org/t/p/${tmdbSize}${trimmed}`;
  return resolveSafeExternalUrl(trimmed) || '';
}

export function isValidRetailBarcode(value: string) {
  // ⚡ Bolt: Avoid array allocations (.split, .map, .reverse, .reduce) by scanning char codes in-place
  const digitsOnly = value.replace(/\s+/g, '');
  const len = digitsOnly.length;
  if ((len !== 8 && len !== 12 && len !== 13 && len !== 14) || !/^\d+$/.test(digitsOnly)) {
    return false;
  }

  let weightedSum = 0;
  let multiplier = 3;
  for (let i = len - 2; i >= 0; i--) {
    weightedSum += (digitsOnly.charCodeAt(i) - 48) * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }

  const checkDigit = digitsOnly.charCodeAt(len - 1) - 48;
  return (10 - (weightedSum % 10)) % 10 === checkDigit;
}
