import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import zxing from '@zxing/library';
const {
  BinaryBitmap,
  Code128Reader,
  Code39Reader,
  EAN13Reader,
  HybridBinarizer,
  ITFReader,
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

export const preprocessBarcodeImage = async (imagePath) => {
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

// ⚡ Bolt: Reuse ZXing reader instances across rotations and requests
const BARCODE_READERS = [
  new EAN13Reader(),
  new Code128Reader(),
  new Code39Reader(),
  new ITFReader(),
];

const tryDecodeBitmap = (bitmap, readers = BARCODE_READERS) => {
  for (const reader of readers) {
    try {
      const result = reader.decode(bitmap);
      return { value: result.getText(), format: result.getBarcodeFormat().toString() };
    } catch (error) {
      if (['NotFoundException', 'FormatException', 'ChecksumException'].includes(error?.name)) {
        continue;
      }
      throw error;
    }
  }
  return null;
};

// ⚡ Bolt: Rotate 1-channel grayscale pixels in-memory to avoid repeated PNG encode/decode overhead
const rotateGrayscale = (src, width, height, angle, dst) => {
  if (angle === 180) {
    for (let i = 0, j = src.length - 1; i < src.length; i++, j--) {
      dst[i] = src[j];
    }
    return { width, height };
  }

  if (angle === 90) {
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      const dstX = height - 1 - y;
      for (let x = 0; x < width; x++) {
        dst[x * height + dstX] = src[rowOffset + x];
      }
    }
    return { width: height, height: width };
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      dst[(width - 1 - x) * height + y] = src[rowOffset + x];
    }
  }
  return { width: height, height: width };
};

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
  let rotatedBuffer;

  for (const angle of [0, 90, 180, 270]) {
    let luminanceBytes = baseLuminance;
    let width = baseWidth;
    let height = baseHeight;

    if (angle !== 0) {
      rotatedBuffer ??= new Uint8ClampedArray(baseLuminance.length);
      ({ width, height } = rotateGrayscale(baseLuminance, baseWidth, baseHeight, angle, rotatedBuffer));
      luminanceBytes = rotatedBuffer;
    }

    const luminanceSource = new RGBLuminanceSource(luminanceBytes, width, height);
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
