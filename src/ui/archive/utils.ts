/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Archive Utility Functions: Checksum, Auto-Classification, Year Extraction, and Thumbnails
 */

import { ArchiveClassification } from './types';

/**
 * Calculates SHA-256 hex checksum of a Blob or ArrayBuffer using standard Web Crypto API.
 */
export async function calculateFileChecksum(data: Blob | ArrayBuffer): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Automatically classifies incoming files based on extension and MIME type.
 */
export function classifyFile(filename: string, mimeType: string): ArchiveClassification {
  const lowerName = filename.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  // Photoshop master templates
  if (lowerName.endsWith('.psd') || lowerMime.includes('photoshop') || lowerMime === 'image/vnd.adobe.photoshop') {
    return 'PHOTOSHOP_TEMPLATE';
  }

  // Scanned card artwork
  if (
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.tif') ||
    lowerName.endsWith('.tiff') ||
    lowerMime.startsWith('image/')
  ) {
    return 'CARD_ARTWORK';
  }

  return 'OTHER_ASSET';
}

/**
 * Extracts 4-digit creation year from filename, relative local folder path, or Google Drive folder path.
 * 
 * Rules:
 * - Scans folder path hierarchy first (e.g. "Humber Archive/2021/Scans" -> 2021).
 * - Scans filename with strict validation (e.g. "1999_Dave_Rig.jpg", "Sarah (2018).png").
 * - Filters out image dimensions (e.g. 1920x1080), ISO speeds (ISO3200), ports (port 3000), sequence codes.
 * - Supports historical collection span (1950–2050).
 * - Returns null when a year cannot be reliably determined (marking for manual review).
 */
export function extractYearFromFilename(filename: string, folderPath?: string | null): number | null {
  const isPlausibleYear = (y: number): boolean => y >= 1950 && y <= 2050;

  // 1. Inspect folder path segments first (highest confidence signal)
  if (folderPath) {
    const segments = folderPath.split(/[/\\]+/).map(s => s.trim()).filter(Boolean);
    // Scan backwards from immediate parent folder
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];

      // Exact 4-digit folder (e.g. "2021", "1998")
      if (/^(?:19|20)\d{2}$/.test(seg)) {
        const y = parseInt(seg, 10);
        if (isPlausibleYear(y)) return y;
      }

      // Folder containing year keyword or delimited year (e.g. "Archive-2022", "Year_2019", "2018 Scans")
      const folderMatch = seg.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
      if (folderMatch) {
        const y = parseInt(folderMatch[1], 10);
        if (isPlausibleYear(y)) return y;
      }
    }
  }

  // 2. Inspect filename
  // Remove file extension
  const baseName = filename.replace(/\.[^/.]+$/, '');

  // Strip known non-year numbers to prevent false positives:
  // - Image resolutions: 1920x1080, 1080x720, 2048x1536, 4096x2160
  // - Resolution tags: 1080p, 720p, 2160p
  // - ISO speeds: ISO1600, ISO3200, ISO6400
  // - Hardware/network ports: port_3000, port:8080
  // - Camera file sequences: DSC_1080, IMG_2048, SCAN_4096
  const sanitized = baseName
    .replace(/\b\d{3,4}\s*x\s*\d{3,4}\b/gi, ' ')
    .replace(/\b\d{3,4}p\b/gi, ' ')
    .replace(/\biso[-_ ]?\d{3,5}\b/gi, ' ')
    .replace(/\b(port|baud)[-_ ]?\d{3,5}\b/gi, ' ')
    .replace(/\b(dsc|img|scan|raw)[-_ ]?\d{4,}\b/gi, ' ')
    .replace(/\$\d{4}\b/g, ' ');

  // Priority A: Year at start or end of filename (e.g. "1999_Dave.jpg", "Dave_2021.jpg")
  const startMatch = sanitized.match(/^((?:19|20)\d{2})[-_ ]/);
  if (startMatch) {
    const y = parseInt(startMatch[1], 10);
    if (isPlausibleYear(y)) return y;
  }

  const endMatch = sanitized.match(/[-_ ]((?:19|20)\d{2})$/);
  if (endMatch) {
    const y = parseInt(endMatch[1], 10);
    if (isPlausibleYear(y)) return y;
  }

  // Priority B: Year enclosed in parentheses or brackets: (2018), [1995]
  const bracketMatch = sanitized.match(/[\(\[]((?:19|20)\d{2})[\)\]]/);
  if (bracketMatch) {
    const y = parseInt(bracketMatch[1], 10);
    if (isPlausibleYear(y)) return y;
  }

  // Priority C: Explicit year keyword: "year_2022", "year-1985"
  const explicitMatch = sanitized.match(/\byear[-_ ]?((?:19|20)\d{2})\b/i);
  if (explicitMatch) {
    const y = parseInt(explicitMatch[1], 10);
    if (isPlausibleYear(y)) return y;
  }

  // Priority D: Isolated 4-digit year bounded by word boundaries or punctuation
  const isolatedMatch = sanitized.match(/(?:^|[^0-9a-zA-Z])((?:19|20)\d{2})(?:[^0-9a-zA-Z]|$)/);
  if (isolatedMatch) {
    const y = parseInt(isolatedMatch[1], 10);
    if (isPlausibleYear(y)) return y;
  }

  return null;
}

/**
 * Generates a collision-safe, deterministic, human-readable Archive ID.
 * Incorporates:
 * - Year prefix (if available)
 * - Clean slugified filename
 * - 16-character SHA-256 cryptographic digest slice (64 bits of entropy)
 */
export function generateStableArchiveId(checksum: string, filename: string, year?: number | null): string {
  let cleanName = filename
    .toLowerCase()
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[^a-z0-9]+/g, '-') // slugify
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  // If cleanName already starts with the year, avoid duplicate year prefix (e.g. arc-1999-1999-...)
  if (year && cleanName.startsWith(`${year}-`)) {
    cleanName = cleanName.slice(`${year}-`.length);
  } else if (year && cleanName === `${year}`) {
    cleanName = 'card';
  }

  const yearStr = year ? `${year}-` : '';
  const hashDigest = checksum.slice(0, 16);
  return `arc-${yearStr}${cleanName || 'card'}-${hashDigest}`;
}

/**
 * Generates a high-quality derived thumbnail Blob for card preview.
 * Returns null for PSD or non-renderable assets.
 */
export async function generateThumbnail(
  imageBlob: Blob, 
  maxWidth = 320, 
  maxHeight = 440
): Promise<Blob | null> {
  // PSD files cannot be natively rendered by canvas in browser without third-party parser
  if (imageBlob.type.includes('photoshop') || imageBlob.type === 'image/vnd.adobe.photoshop') {
    return null;
  }

  // If in pure Node test environment without DOM Image, return null
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Compute aspect-ratio-preserving dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/webp', 0.85);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.src = objectUrl;
  });
}

/**
 * Formats bytes to human-readable size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Converts a Blob to a Base64 string for portable JSON export.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        // Strip data URL prefix
        const base64 = res.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Universal Node.js / worker fallback
  const buffer = await blob.arrayBuffer();
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string back to a Blob for archive restoration.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Blob([buf], { type: mimeType });
  }
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
