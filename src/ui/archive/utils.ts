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
 * Extracts 4-digit creation year from filename or folder path (e.g. "2022_Sarah_Cable.jpg" or "Archive/2021/").
 */
export function extractYearFromFilename(filename: string, folderPath?: string | null): number | null {
  const combined = `${folderPath || ''}/${filename}`;
  // Look for years between 2000 and 2099
  const match = combined.match(/\b(20[0-2][0-9])\b/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 2000 && year <= 2030) {
      return year;
    }
  }
  return null;
}

/**
 * Generates a stable, human-readable Archive ID.
 */
export function generateStableArchiveId(checksum: string, filename: string, year?: number | null): string {
  const cleanName = filename
    .toLowerCase()
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[^a-z0-9]+/g, '-') // slugify
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  const yearStr = year ? `${year}-` : '';
  const shortHash = checksum.slice(0, 8);
  return `arc-${yearStr}${cleanName || 'card'}-${shortHash}`;
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
