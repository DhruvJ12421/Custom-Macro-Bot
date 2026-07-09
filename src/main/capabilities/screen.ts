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

export function containsColor(png: Buffer, hex: string, tolerance: number): boolean {
  const image = nativeImage.createFromBuffer(png);
  const bitmap = image.toBitmap();
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((x) =>
    Number.parseInt(x!, 16),
  );
  for (let i = 0; i < bitmap.length; i += 4)
    if (
      Math.abs(bitmap[i + 2]! - r!) <= tolerance &&
      Math.abs(bitmap[i + 1]! - g!) <= tolerance &&
      Math.abs(bitmap[i]! - b!) <= tolerance
    )
      return true;
  return false;
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
