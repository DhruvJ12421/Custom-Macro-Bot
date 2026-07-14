import screenshot from 'screenshot-desktop';
import { nativeImage } from 'electron';
import { createWorker, type Worker } from 'tesseract.js';
import type { WindowInfo } from '../../shared/workflow';

let ocrWorker: Worker | undefined;
async function worker() {
  ocrWorker ??= await createWorker('eng');
  return ocrWorker;
}

type DetectionRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  relativeTo?: 'target' | 'screen';
};

function crop(window: WindowInfo, region: DetectionRegion) {
  if (region.relativeTo === 'screen') return region;
  if (
    region.x + region.width > window.bounds.width ||
    region.y + region.height > window.bounds.height
  )
    throw new Error('Detection region is outside the target window');
  return {
    x: window.bounds.x + region.x,
    y: window.bounds.y + region.y,
    width: region.width,
    height: region.height,
  };
}

export async function captureRegion(window: WindowInfo, region: DetectionRegion): Promise<Buffer> {
  const image = nativeImage.createFromBuffer(await screenshot({ format: 'png' }));
  return image.crop(crop(window, region)).toPNG();
}

export type ColorMatchResult = {
  passed: boolean;
  matchedPixels: number;
  totalPixels: number;
  requiredPixels: number;
  bestDistance: number;
  closestColor: string;
};

function toHexChannel(value: number) {
  return value.toString(16).padStart(2, '0');
}

export function analyzeColor(png: Buffer, hex: string, tolerance: number): ColorMatchResult {
  const image = nativeImage.createFromBuffer(png);
  const bitmap = image.toBitmap();
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((x) =>
    Number.parseInt(x!, 16),
  );
  let matchedPixels = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let closestColor = '#000000';
  for (let i = 0; i < bitmap.length; i += 4) {
    const pixelB = bitmap[i]!;
    const pixelG = bitmap[i + 1]!;
    const pixelR = bitmap[i + 2]!;
    const distance = Math.hypot(pixelR - r!, pixelG - g!, pixelB - b!);
    if (distance < bestDistance) {
      bestDistance = distance;
      closestColor = `#${toHexChannel(pixelR)}${toHexChannel(pixelG)}${toHexChannel(pixelB)}`;
    }
    if (distance <= tolerance) matchedPixels++;
  }
  const totalPixels = bitmap.length / 4;
  const requiredPixels = Math.max(8, Math.ceil(totalPixels * 0.001));
  return {
    passed: matchedPixels >= requiredPixels,
    matchedPixels,
    totalPixels,
    requiredPixels,
    bestDistance,
    closestColor,
  };
}

export function containsColor(png: Buffer, hex: string, tolerance: number): boolean {
  return analyzeColor(png, hex, tolerance).passed;
}

export async function containsText(
  png: Buffer,
  expected: string,
  confidence: number,
): Promise<boolean> {
  const result = await recognizeText(png);
  return (
    result.confidence >= confidence && result.text.toLowerCase().includes(expected.toLowerCase())
  );
}

export async function recognizeText(png: Buffer): Promise<{ text: string; confidence: number }> {
  const result = await (await worker()).recognize(png);
  return { text: result.data.text.trim(), confidence: result.data.confidence };
}
