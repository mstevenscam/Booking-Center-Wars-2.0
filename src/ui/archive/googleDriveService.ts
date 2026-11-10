/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Google Drive API & Google Picker Integration Service
 * 
 * Implements:
 * - Google Identity Services (GIS) token client for client-side OAuth.
 * - Google Picker API integration with least-privilege scopes (drive.file, drive.metadata.readonly).
 * - Drive API v3 folder listing, year-based navigation, and alt=media binary downloads.
 * - Diagnostic checklist for Google Cloud project setup.
 */

import { DriveFolderInfo, DriveFileItem } from './types';

// Minimum practical scopes according to least-privilege requirements
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

export interface GoogleDriveConfigStatus {
  isConfigured: boolean;
  clientId?: string;
  hasApiKey: boolean;
  missingConfig: string[];
}

export class GoogleDriveService {
  private accessToken: string | null = null;
  private tokenClient: any = null;
  private isGapiLoaded = false;
  private isGsiLoaded = false;

  /**
   * Checks whether Google Drive client credentials are provided via environment variables.
   * Both VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY are required for the intended Google Picker integration.
   */
  public getConfigStatus(): GoogleDriveConfigStatus {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
    const missing: string[] = [];

    if (!clientId) missing.push('VITE_GOOGLE_CLIENT_ID');
    if (!apiKey) missing.push('VITE_GOOGLE_API_KEY');

    return {
      isConfigured: Boolean(clientId && apiKey),
      clientId: clientId ? `${clientId.slice(0, 12)}...` : undefined,
      hasApiKey: Boolean(apiKey),
      missingConfig: missing,
    };
  }

  /**
   * Dynamically loads Google Identity Services (GIS) script.
   */
  public async loadGsiScript(): Promise<void> {
    if (this.isGsiLoaded || typeof window === 'undefined') return;

    return new Promise((resolve, reject) => {
      const existing = document.getElementById('gsi-client-script');
      if (existing) {
        this.isGsiLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.id = 'gsi-client-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.isGsiLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK'));
      document.body.appendChild(script);
    });
  }

  /**
   * Dynamically loads Google API Client & Picker scripts.
   */
  public async loadPickerScript(): Promise<void> {
    if (this.isGapiLoaded || typeof window === 'undefined') return;

    return new Promise((resolve, reject) => {
      const existing = document.getElementById('gapi-client-script');
      if (existing) {
        (window as any).gapi.load('picker', () => {
          this.isGapiLoaded = true;
          resolve();
        });
        return;
      }

      const script = document.createElement('script');
      script.id = 'gapi-client-script';
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        (window as any).gapi.load('picker', () => {
          this.isGapiLoaded = true;
          resolve();
        });
      };
      script.onerror = () => reject(new Error('Failed to load Google API Client SDK'));
      document.body.appendChild(script);
    });
  }

  /**
   * Authorizes user using Google Identity Services (GIS) token client.
   */
  public async requestAccessToken(): Promise<string> {
    const config = this.getConfigStatus();
    if (!config.isConfigured) {
      throw new Error(
        'Google Drive OAuth is not configured. Please supply VITE_GOOGLE_CLIENT_ID in your environment.'
      );
    }

    await this.loadGsiScript();
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      throw new Error('Google Identity Services SDK not available');
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPES.join(' '),
          callback: (tokenResponse: any) => {
            if (tokenResponse.error) {
              reject(new Error(`OAuth Error: ${tokenResponse.error}`));
              return;
            }
            this.accessToken = tokenResponse.access_token;
            resolve(this.accessToken!);
          },
        });

        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  public getCachedAccessToken(): string | null {
    return this.accessToken;
  }

  public disconnect(): void {
    if (this.accessToken && typeof window !== 'undefined') {
      const google = (window as any).google;
      if (google?.accounts?.oauth2?.revoke) {
        google.accounts.oauth2.revoke(this.accessToken, () => {
          this.accessToken = null;
        });
        return;
      }
    }
    this.accessToken = null;
  }

  /**
   * Opens native Google Picker widget allowing the user to select card scans or PSDs.
   * Uses DocsView configured in LIST mode with least-privilege drive.file scope and passes the API key.
   */
  public async openPicker(): Promise<DriveFileItem[]> {
    const config = this.getConfigStatus();
    if (!config.isConfigured) {
      throw new Error(
        `Google Drive configuration incomplete. Missing: ${config.missingConfig.join(', ')}`
      );
    }

    const token = this.accessToken || (await this.requestAccessToken());
    await this.loadPickerScript();

    const google = (window as any).google;
    if (!google?.picker) {
      throw new Error('Google Picker API not loaded');
    }

    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    return new Promise((resolve, reject) => {
      try {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);

        // DocsViewMode.LIST is explicitly recommended for drive.file scopes
        if (google.picker.DocsViewMode && google.picker.DocsViewMode.LIST) {
          view.setMode(google.picker.DocsViewMode.LIST);
        }

        const pickerBuilder = new google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setOrigin(pickerOrigin)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .setTitle('Select Physical Card Scans & Templates');

        if (apiKey) {
          pickerBuilder.setDeveloperKey(apiKey);
        }

        pickerBuilder.setCallback((data: any) => {
          try {
            if (!data) return;

            // Handle cancellation separately
            if (data.action === google.picker.Action.CANCEL) {
              resolve([]);
              return;
            }

            // Handle selection
            if (data.action === google.picker.Action.PICKED) {
              // Canonical documented property is data[google.picker.Response.DOCUMENTS], fallback to data.docs
              const rawDocs =
                (google.picker.Response && data[google.picker.Response.DOCUMENTS]) ||
                data.docs ||
                [];

              if (!Array.isArray(rawDocs)) {
                reject(new Error('Invalid Picker selection response: documents list is malformed.'));
                return;
              }

              if (rawDocs.length === 0) {
                reject(new Error('Google Picker indicated an item was picked, but no document metadata was returned.'));
                return;
              }

              const validFiles: DriveFileItem[] = [];
              for (const doc of rawDocs) {
                const id = doc.id || doc[google.picker.Document?.ID || 'id'];
                const name = doc.name || doc[google.picker.Document?.NAME || 'name'];
                const mimeType = doc.mimeType || doc[google.picker.Document?.MIME_TYPE || 'mimeType'] || 'application/octet-stream';

                if (!id || !name) {
                  reject(new Error('One or more selected Google Drive files are missing a valid File ID or Name.'));
                  return;
                }

                // Parse size safely
                const rawSize = doc.sizeBytes || doc[google.picker.Document?.SIZE_BYTES || 'sizeBytes'];
                const size = rawSize ? parseInt(rawSize, 10) : 0;

                // Extract timestamp if available
                const rawTime = doc.lastEditedUtc || doc.createdTime;
                const createdTime = rawTime ? new Date(rawTime).toISOString() : undefined;

                // Extract parent folder name/path if available from Picker document metadata
                let folderPath: string | undefined = undefined;
                if (doc.parentId) {
                  folderPath = doc.parentName || doc.parentId;
                } else if (doc.parentName) {
                  folderPath = doc.parentName;
                }

                validFiles.push({
                  id,
                  name,
                  mimeType,
                  size: isNaN(size) ? 0 : size,
                  createdTime,
                  folderPath,
                });
              }

              resolve(validFiles);
            }
          } catch (callbackErr) {
            reject(callbackErr);
          }
        });

        const picker = pickerBuilder.build();
        picker.setVisible(true);
      } catch (builderErr) {
        reject(builderErr);
      }
    });
  }

  /**
   * Queries folders in user's Drive, extracting year folders (e.g. "2018", "2021", "2022").
   */
  public async listYearFolders(parentFolderId = 'root'): Promise<DriveFolderInfo[]> {
    const token = this.accessToken || (await this.requestAccessToken());
    const query = `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=50`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Drive folder query failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const files: any[] = data.files || [];

    return files.map(f => {
      const match = f.name.match(/\b(20[0-2][0-9])\b/);
      return {
        id: f.id,
        name: f.name,
        year: match ? parseInt(match[1], 10) : null,
      };
    });
  }

  /**
   * Lists physical card images and PSD files within a specific Drive folder.
   */
  public async listFilesInFolder(folderId: string): Promise<DriveFileItem[]> {
    const token = this.accessToken || (await this.requestAccessToken());
    const query = `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or name contains '.psd')`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,createdTime)&pageSize=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Drive file list failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : 0,
      createdTime: f.createdTime,
    }));
  }

  /**
   * Downloads raw unaltered binary file from Google Drive (alt=media).
   * Confirms HTTP 200 OK and non-empty Blob payload.
   */
  public async downloadFileBinary(fileId: string): Promise<Blob> {
    const token = this.accessToken || (await this.requestAccessToken());
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      let errorDetail = '';
      try {
        const errorJson = await res.json();
        errorDetail = errorJson?.error?.message || '';
      } catch {
        // Response wasn't JSON
      }

      if (res.status === 401) {
        throw new Error(`Authentication expired or invalid token (HTTP 401). ${errorDetail}`.trim());
      } else if (res.status === 403) {
        throw new Error(
          `Permission denied (HTTP 403): Your account does not have read access to file ${fileId}. ${errorDetail}`.trim()
        );
      } else if (res.status === 404) {
        throw new Error(`File not found in Google Drive (HTTP 404): ${fileId}`);
      } else {
        throw new Error(
          `Google Drive download failed (HTTP ${res.status} ${res.statusText}): ${errorDetail || fileId}`
        );
      }
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      throw new Error(`Downloaded empty file content (0 bytes) for file ID ${fileId}`);
    }

    return blob;
  }
}

export const googleDriveService = new GoogleDriveService();
