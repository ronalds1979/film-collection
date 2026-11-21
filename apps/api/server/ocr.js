import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import zxing from '@zxing/library';
const {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  LuminanceSource,
  MultiFormatOneDReader,
  RGBLuminanceSource,
} = zxing;

let workerPromise;
let ocrQueue = Promise.resolve();
const MAX_OCR_QUEUE_DEPTH = 5;
let pendingOcrCount = 0;

const getWorker = () => {
  // ⚡ Bolt: Load only 'eng' traineddata and restrict character whitelist to digits for barcode OCR
  workerPromise ??= createWorker('eng').then(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: '0123456789 -',
      preserve_interword_spaces: '1',
    });
    return worker;
  });

  return workerPromise;
};

const runSerializedOcr = (imageBuffer) => {
  if (pendingOcrCount >= MAX_OCR_QUEUE_DEPTH) {
    const error = new Error('Barcode OCR queue is busy. Please try again shortly.');
    error.status = 429;
    return Promise.reject(error);
  }
  pendingOcrCount += 1;
  const job = ocrQueue.then(async () => {
    const worker = await getWorker();
    return worker.recognize(imageBuffer);
  }).finally(() => {
    pendingOcrCount = Math.max(0, pendingOcrCount - 1);
  });
  // Keep the queue alive even if a single recognition rejects
  ocrQueue = job.catch(() => undefined);
  return job;
};

export const ALLOWED_SHARP_FORMATS = new Set([
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'tiff',
  'heif',
]);

export const preprocessBarcodeImage = async (imagePath) => {
  const meta = await sharp(imagePath, { failOn: 'error', limitInputPixels: 25_000_000 }).metadata();
  if (!meta.format || !ALLOWED_SHARP_FORMATS.has(meta.format)) {
    throw new Error('Unsupported image format for barcode preprocessing.');
  }
  const image = sharp(imagePath, { failOn: 'error', limitInputPixels: 25_000_000 })
    .rotate()
    .resize({
      width: 2400,
      height: 3200,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .png();

  return image.toBuffer();
};

// ⚡ Bolt: Use a single MultiFormatOneDReader with explicit POSSIBLE_FORMATS so
// GlobalHistogramBinarizer.getBlackRow() runs once per scanned row instead of 4x.
// Omitting UPC_A preserves EAN_13 format output from MultiFormatUPCEANReader.
const BARCODE_HINTS = new Map([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF],
  ],
]);
const BARCODE_READER = new MultiFormatOneDReader(BARCODE_HINTS);

const tryDecodeBitmap = (bitmap) => {
  try {
    const result = BARCODE_READER.decode(bitmap, BARCODE_HINTS);
    return { value: result.getText(), format: result.getBarcodeFormat().toString() };
  } catch (error) {
    if (['NotFoundException', 'FormatException', 'ChecksumException'].includes(error?.name)) {
      return null;
    }
    throw error;
  }
};

// ⚡ Bolt: Lazy 90° clockwise LuminanceSource that extracts only the rows OneDReader scans
// (~25 rows) on demand, avoiding a full-image buffer allocation and strided transpose.
class Rotated90LuminanceSource extends LuminanceSource {
  constructor(luminances, srcWidth, srcHeight) {
    super(srcHeight, srcWidth);
    this.luminances = luminances;
    this.srcWidth = srcWidth;
    this.srcHeight = srcHeight;
  }

  getRow(y, row) {
    const width = this.srcHeight;
    if (!row || row.length < width) {
      row = new Uint8ClampedArray(width);
    }
    const src = this.luminances;
    const step = this.srcWidth;
    let srcOffset = (width - 1) * step + y;
    for (let x = 0; x < width; x++) {
      row[x] = src[srcOffset];
      srcOffset -= step;
    }
    return row;
  }

  getMatrix() {
    const width = this.srcHeight;
    const height = this.srcWidth;
    const matrix = new Uint8ClampedArray(width * height);
    const src = this.luminances;
    for (let y = 0; y < width; y++) {
      const rowOffset = y * height;
      const dstX = width - 1 - y;
      for (let x = 0; x < height; x++) {
        matrix[x * width + dstX] = src[rowOffset + x];
      }
    }
    return matrix;
  }
}

// ⚡ Bolt: Fast 2x grayscale downsample (4x fewer pixels) for rapid ZXing pre-pass
const downsampleGrayscale2x = (src, width, height) => {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const dst = new Uint8ClampedArray(halfW * halfH);
  for (let y = 0; y < halfH; y++) {
    const srcRow = y * 2 * width;
    const dstRow = y * halfW;
    for (let x = 0; x < halfW; x++) {
      dst[dstRow + x] = src[srcRow + x * 2];
    }
  }
  return { data: dst, width: halfW, height: halfH };
};

const detectBarcodeAcrossAngles = (baseLuminance, baseWidth, baseHeight) => {
  // ⚡ Bolt: Scan 0° and lazy 90° only; OneDReader.doDecode() already reverses every
  // scanned BitArray row in-place to cover 180° and 270° without rotating the image.
  const sources = [
    new RGBLuminanceSource(baseLuminance, baseWidth, baseHeight),
    new Rotated90LuminanceSource(baseLuminance, baseWidth, baseHeight),
  ];

  for (const luminanceSource of sources) {
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const result = tryDecodeBitmap(bitmap);
    if (result) {
      return result;
    }
  }

  return null;
};

const detectBarcodeFromBuffer = (data, info) => {
  const baseLuminance = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

  // ⚡ Bolt: Try 2x downsampled pass first when image is large (cuts rotation + binarizer work by 75%)
  if (info.width >= 1000 && info.height >= 800) {
    const half = downsampleGrayscale2x(baseLuminance, info.width, info.height);
    const fastResult = detectBarcodeAcrossAngles(half.data, half.width, half.height);
    if (fastResult) {
      return fastResult;
    }
  }

  return detectBarcodeAcrossAngles(baseLuminance, info.width, info.height);
};

export const detectBarcode = async (imagePath) => {
  // ⚡ Bolt: Decode, resize, grayscale, and normalize once at 2000x1600 max instead of 4000x3200
  const { data, info } = await sharp(imagePath, { failOn: 'error', limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 2000, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return detectBarcodeFromBuffer(data, info);
};

export const recognizeBarcode = async (imagePath) => {
  const meta = await sharp(imagePath, { failOn: 'error', limitInputPixels: 25_000_000 }).metadata();
  if (!meta.format || !ALLOWED_SHARP_FORMATS.has(meta.format)) {
    throw new Error('Unsupported image format for barcode scan.');
  }
  // ⚡ Bolt: Decode image once and reuse raw grayscale buffer for OCR fallback if ZXing fails
  const { data: rawData, info } = await sharp(imagePath, { failOn: 'error', limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 2000, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const detectedBarcode = detectBarcodeFromBuffer(rawData, info);
  if (detectedBarcode) {
    return {
      barcode: detectedBarcode.value,
      barcodeFormat: detectedBarcode.format,
      barcodeSource: 'zxing',
      barcodeValidated: isValidRetailBarcode(detectedBarcode.value),
    };
  }

  // ⚡ Bolt: Downscale OCR fallback to 1200x960 max and skip PNG zlib compression for internal Tesseract buffer
  const processedImage = await sharp(rawData, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .resize({ width: 1200, height: 960, fit: 'inside', withoutEnlargement: true })
    .sharpen({ sigma: 1.2 })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const { data } = await runSerializedOcr(processedImage);
  const barcode = extractBarcodeCandidates(data.text || '')[0] || '';

  return {
    barcode,
    barcodeFormat: barcode ? 'OCR_TEXT' : null,
    barcodeSource: barcode ? 'ocr' : null,
    barcodeValidated: isValidRetailBarcode(barcode),
  };
};

export const extractBarcodeCandidates = (text) => {
  const matches = [...(text || '').matchAll(/(?:\d[\s-]*){8,17}/g)]
    .map((match) => match[0].replace(/\D/g, ''))
    .filter((value) => [8, 12, 13, 14].includes(value.length) && isValidRetailBarcode(value));

  return Array.from(new Set(matches));
};

export const isValidRetailBarcode = (value) => {
  const len = value.length;
  if ((len !== 8 && len !== 12 && len !== 13 && len !== 14) || !/^\d+$/.test(value)) {
    return false;
  }

  let weightedSum = 0;
  let multiplier = 3;
  for (let i = len - 2; i >= 0; i--) {
    weightedSum += (value.charCodeAt(i) - 48) * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }

  const checkDigit = value.charCodeAt(len - 1) - 48;
  return (10 - (weightedSum % 10)) % 10 === checkDigit;
};

export const terminateOcrWorker = async () => {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = undefined;
  }
};
