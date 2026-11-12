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

const getWorker = () => {
  workerPromise ??= createWorker('eng+por+spa').then(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    return worker;
  });

  return workerPromise;
};

export const preprocessBarcodeImage = async (imagePath) => {
  const image = sharp(imagePath, { failOn: 'error' })
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

const tryDecodeBitmap = (bitmap, readers) => {
  for (const Reader of readers) {
    try {
      const result = new Reader().decode(bitmap);
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

export const detectBarcode = async (imagePath) => {
  const readers = [
    EAN13Reader,
    Code128Reader,
    Code39Reader,
    ITFReader,
  ];
  // ⚡ Bolt: Decode, resize, grayscale, and normalize once instead of encoding a PNG and re-decoding 4x
  const { data, info } = await sharp(imagePath, { failOn: 'error' })
    .rotate()
    .resize({ width: 4000, height: 3200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const baseLuminance = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  let rotatedBuffer;

  for (const angle of [0, 90, 180, 270]) {
    let luminanceBytes = baseLuminance;
    let width = info.width;
    let height = info.height;

    if (angle !== 0) {
      rotatedBuffer ??= new Uint8ClampedArray(baseLuminance.length);
      ({ width, height } = rotateGrayscale(baseLuminance, info.width, info.height, angle, rotatedBuffer));
      luminanceBytes = rotatedBuffer;
    }

    const luminanceSource = new RGBLuminanceSource(luminanceBytes, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    const result = tryDecodeBitmap(bitmap, readers);
    if (result) {
      return result;
    }
  }

  return null;
};

export const recognizeBarcode = async (imagePath) => {
  const detectedBarcode = await detectBarcode(imagePath);
  if (detectedBarcode) {
    return {
      barcode: detectedBarcode.value,
      barcodeFormat: detectedBarcode.format,
      barcodeSource: 'zxing',
      barcodeValidated: isValidRetailBarcode(detectedBarcode.value),
    };
  }

  const processedImage = await preprocessBarcodeImage(imagePath);
  const worker = await getWorker();
  const { data } = await worker.recognize(processedImage);
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
