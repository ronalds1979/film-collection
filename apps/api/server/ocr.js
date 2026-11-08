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

export const detectBarcode = async (imagePath) => {
  const readers = [
    EAN13Reader,
    Code128Reader,
    Code39Reader,
    ITFReader,
  ];
  const orientedImage = await sharp(imagePath, { failOn: 'error' })
    .rotate()
    .resize({ width: 4000, height: 3200, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  for (const angle of [0, 90, 180, 270]) {
    const { data, info } = await sharp(orientedImage, { failOn: 'error' })
      .rotate(angle)
      .grayscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminanceSource = new RGBLuminanceSource(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
    );
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
