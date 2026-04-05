import { extname } from 'node:path';

const textLikeMimeTypes = new Set(['text/plain', 'text/markdown']);
const textLikeExtensions = new Set(['.txt', '.md', '.log']);

export const isWatermarkContentSupported = (mimeType: string | null, fileName: string | null): boolean => {
  const normalizedMimeType = (mimeType ?? '').toLowerCase();
  if (textLikeMimeTypes.has(normalizedMimeType)) {
    return true;
  }

  const extension = extname(fileName ?? '').toLowerCase();
  return textLikeExtensions.has(extension);
};

export const buildWatermarkLabel = (input: { actorUsername: string; downloadedAt: Date }) => {
  const isoTimestamp = input.downloadedAt.toISOString();
  return `Downloaded by ${input.actorUsername} at ${isoTimestamp}`;
};

export const applyTextWatermark = (input: { buffer: Buffer; watermarkLabel: string }): Buffer => {
  const prefix = `[RRGA WATERMARK] ${input.watermarkLabel}\n\n`;
  return Buffer.concat([Buffer.from(prefix, 'utf8'), input.buffer]);
};
