import { basename } from 'node:path';

export type UploadSecurityStatus = 'CLEAN' | 'WARNING' | 'HELD';

export interface UploadSecurityAnalysis {
  normalizedFileName: string;
  normalizedMimeType: string | null;
  detectedMimeType: string | null;
  sizeBytes: number;
  isPreviewable: boolean;
  status: UploadSecurityStatus;
  findings: string[];
  holdForAdminReview: boolean;
  blockedReason: string | null;
}

const MIME_PDF = 'application/pdf';
const MIME_ZIP = 'application/zip';

const isAsciiTextBuffer = (buffer: Buffer): boolean => {
  const sampleLength = Math.min(buffer.length, 4096);
  if (sampleLength === 0) {
    return false;
  }

  let printable = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    const value = buffer[i] ?? 0;
    if (
      value === 9 ||
      value === 10 ||
      value === 13 ||
      (value >= 32 && value <= 126)
    ) {
      printable += 1;
    }
  }

  return printable / sampleLength >= 0.85;
};

const decodeTextSample = (buffer: Buffer): string => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 256 * 1024));
  return sample.toString('utf8');
};

const detectMimeType = (buffer: Buffer, declaredMimeType: string): string | null => {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return MIME_PDF;
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }

  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }

  if (buffer.length >= 4) {
    const signature = buffer.readUInt32LE(0);
    if (signature === 0x04034b50 || signature === 0x06054b50 || signature === 0x08074b50) {
      return MIME_ZIP;
    }
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    return 'application/x-elf';
  }

  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'MZ') {
    return 'application/x-msdownload';
  }

  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === '#!') {
    return 'text/x-shellscript';
  }

  if (isAsciiTextBuffer(buffer)) {
    return declaredMimeType && declaredMimeType !== 'application/octet-stream' ? declaredMimeType : 'text/plain';
  }

  return declaredMimeType && declaredMimeType !== 'application/octet-stream' ? declaredMimeType : null;
};

const isPreviewableMime = (mimeType: string | null): boolean => {
  if (!mimeType) {
    return false;
  }

  return mimeType === MIME_PDF || mimeType.startsWith('image/');
};

const isExecutableSuffix = (name: string): boolean => {
  const lower = name.toLowerCase();
  return ['.exe', '.dll', '.msi', '.bat', '.cmd', '.com', '.ps1', '.sh', '.scr', '.appimage'].some((suffix) => lower.endsWith(suffix));
};

interface ZipStats {
  entryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  nestedArchiveCount: number;
}

const parseZipStats = (buffer: Buffer): ZipStats | null => {
  const maxCommentScan = Math.min(buffer.length, 66_000);
  const start = buffer.length - maxCommentScan;
  let eocdOffset = -1;

  for (let index = buffer.length - 22; index >= start; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) {
    return null;
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
    return null;
  }

  let cursor = centralDirectoryOffset;
  let visited = 0;
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let nestedArchiveCount = 0;

  while (cursor + 46 <= buffer.length && visited < entryCount) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature !== 0x02014b50) {
      break;
    }

    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    if (fileNameEnd > buffer.length) {
      break;
    }

    const fileName = buffer.subarray(fileNameStart, fileNameEnd).toString('utf8').toLowerCase();
    if (['.zip', '.jar', '.7z', '.tar', '.gz'].some((suffix) => fileName.endsWith(suffix))) {
      nestedArchiveCount += 1;
    }

    compressedBytes += compressedSize;
    uncompressedBytes += uncompressedSize;

    const next = fileNameEnd + extraLength + commentLength;
    if (next <= cursor) {
      break;
    }

    cursor = next;
    visited += 1;
  }

  return {
    entryCount: visited,
    compressedBytes,
    uncompressedBytes,
    nestedArchiveCount
  };
};

const inspectSensitivePatterns = (buffer: Buffer): { findings: string[]; shouldHold: boolean } => {
  if (!isAsciiTextBuffer(buffer)) {
    return { findings: [], shouldHold: false };
  }

  const text = decodeTextSample(buffer);
  const findings: string[] = [];
  let hold = false;

  if (/-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/i.test(text)) {
    findings.push('private_key_material_detected');
    hold = true;
  }

  if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) {
    findings.push('aws_access_key_pattern_detected');
    hold = true;
  }

  const credentialLikeMatches = text.match(/\b(?:password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*['\"]?[A-Za-z0-9_\-+/=.]{8,}/gi) ?? [];
  if (credentialLikeMatches.length > 0) {
    findings.push('credential_pattern_detected');
    if (credentialLikeMatches.length >= 3) {
      hold = true;
    }
  }

  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
    findings.push('ssn_like_pattern_detected');
  }

  return {
    findings,
    shouldHold: hold
  };
};

export const analyzeUploadedFile = (input: {
  fileName: string;
  declaredMimeType: string;
  buffer: Buffer;
  maxUploadBytes: number;
}): UploadSecurityAnalysis => {
  const normalizedFileName = basename(input.fileName || 'upload.bin');
  const findings: string[] = [];

  if (input.buffer.length > input.maxUploadBytes) {
    return {
      normalizedFileName,
      normalizedMimeType: null,
      detectedMimeType: null,
      sizeBytes: input.buffer.length,
      isPreviewable: false,
      status: 'HELD',
      findings: ['file_too_large'],
      holdForAdminReview: false,
      blockedReason: `File exceeds ${input.maxUploadBytes} bytes limit.`
    };
  }

  const detectedMimeType = detectMimeType(input.buffer, input.declaredMimeType);
  const normalizedMimeType = detectedMimeType ?? input.declaredMimeType ?? null;

  if (isExecutableSuffix(normalizedFileName)) {
    return {
      normalizedFileName,
      normalizedMimeType,
      detectedMimeType,
      sizeBytes: input.buffer.length,
      isPreviewable: false,
      status: 'HELD',
      findings: ['executable_filename_blocked'],
      holdForAdminReview: false,
      blockedReason: 'Executable file uploads are blocked.'
    };
  }

  if (['application/x-msdownload', 'application/x-elf', 'text/x-shellscript'].includes(normalizedMimeType ?? '')) {
    return {
      normalizedFileName,
      normalizedMimeType,
      detectedMimeType,
      sizeBytes: input.buffer.length,
      isPreviewable: false,
      status: 'HELD',
      findings: ['executable_content_blocked'],
      holdForAdminReview: false,
      blockedReason: 'Executable file uploads are blocked.'
    };
  }

  let holdForAdminReview = false;

  if (normalizedMimeType === MIME_ZIP) {
    const zipStats = parseZipStats(input.buffer);
    if (!zipStats) {
      return {
        normalizedFileName,
        normalizedMimeType,
        detectedMimeType,
        sizeBytes: input.buffer.length,
        isPreviewable: false,
        status: 'HELD',
        findings: ['archive_parse_failed'],
        holdForAdminReview: false,
        blockedReason: 'Unable to validate archive upload safely.'
      };
    }

    const expansionRatio = zipStats.compressedBytes > 0 ? zipStats.uncompressedBytes / zipStats.compressedBytes : 0;
    if (zipStats.entryCount > 2000 || zipStats.uncompressedBytes > 512 * 1024 * 1024 || expansionRatio > 150) {
      return {
        normalizedFileName,
        normalizedMimeType,
        detectedMimeType,
        sizeBytes: input.buffer.length,
        isPreviewable: false,
        status: 'HELD',
        findings: ['archive_expansion_limits_exceeded'],
        holdForAdminReview: false,
        blockedReason: 'Archive upload exceeded expansion safety limits.'
      };
    }

    if (zipStats.nestedArchiveCount > 0 || expansionRatio > 20) {
      findings.push('archive_requires_admin_review');
      holdForAdminReview = true;
    }
  }

  const sensitive = inspectSensitivePatterns(input.buffer);
  findings.push(...sensitive.findings);
  if (sensitive.shouldHold) {
    holdForAdminReview = true;
  }

  const status: UploadSecurityStatus = holdForAdminReview ? 'HELD' : findings.length > 0 ? 'WARNING' : 'CLEAN';

  return {
    normalizedFileName,
    normalizedMimeType,
    detectedMimeType,
    sizeBytes: input.buffer.length,
    isPreviewable: isPreviewableMime(normalizedMimeType),
    status,
    findings,
    holdForAdminReview,
    blockedReason: null
  };
};
