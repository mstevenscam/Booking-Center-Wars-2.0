/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * AI-Assisted Cataloguing Helper (Strict Limited Scope)
 * 
 * Rules:
 * - Strictly optional helper.
 * - Extracts visible title, character/item name, visible year, category, and jokes.
 * - NEVER invents missing historical facts or competitive gameplay statistics.
 * - NEVER overwrites original card scans or binaries.
 * - Suggestions require explicit human approval.
 */

import { Department } from '../types';

export interface AIMetadataSuggestion {
  suggestedTitle?: string;
  characterOrItemName?: string;
  detectedYear?: number | null;
  suggestedDepartment?: Department;
  extractedJokesOrFlavor?: string;
  suggestedDescription?: string;
}

export class AIMetadataService {
  /**
   * Checks if Gemini API key is configured in the environment.
   */
  public isAvailable(): boolean {
    const key = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '';
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY || (import.meta.env as any).GEMINI_API_KEY;
    return Boolean(key || viteKey);
  }

  /**
   * Analyzes a physical card scan to suggest metadata based strictly on visible text in the scan.
   */
  public async analyzeCardScan(
    imageBlob: Blob, 
    originalFilename: string
  ): Promise<AIMetadataSuggestion | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      // Dynamic import of @google/genai to avoid packaging issues if unused
      const { GoogleGenAI } = await import('@google/genai');
      const apiKey = 
        (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
        import.meta.env.VITE_GEMINI_API_KEY ||
        '';

      if (!apiKey) return null;

      const ai = new GoogleGenAI({ apiKey });

      // Convert image blob to base64
      const arrayBuffer = await imageBlob.arrayBuffer();
      const base64Data = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const mimeType = imageBlob.type || 'image/jpeg';

      const prompt = `You are a physical card archive cataloguer for "Booking Wars: The Battle for the Booking Centre".
Analyze this scanned image of a physical card (original filename: "${originalFilename}").
Rules:
- Read any visible text on the card.
- Extract the card's printed title or name.
- If there is a printed year (e.g., 2018, 2021, 2022, 2023), record it. Do NOT guess a year if not visible.
- Suggest a department among: TECH, ADMIN, FACILITIES, BOOKING, CHAOS based on the subject (e.g., cameras/cables -> TECH, keys/tools -> FACILITIES, desks/paperwork -> ADMIN).
- Extract any visible jokes, satirical humor, or flavor text printed on the card.
- Output strictly a JSON object with this schema:
{
  "suggestedTitle": "string or null",
  "characterOrItemName": "string or null",
  "detectedYear": number or null,
  "suggestedDepartment": "TECH" | "ADMIN" | "FACILITIES" | "BOOKING" | "CHAOS" | null,
  "extractedJokesOrFlavor": "string or null",
  "suggestedDescription": "string or null"
}
Do NOT output markdown code blocks. Output pure JSON.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      });

      const text = response.text?.trim() || '';
      // Parse JSON from output
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        suggestedTitle: parsed.suggestedTitle || undefined,
        characterOrItemName: parsed.characterOrItemName || undefined,
        detectedYear: typeof parsed.detectedYear === 'number' ? parsed.detectedYear : null,
        suggestedDepartment: parsed.suggestedDepartment || undefined,
        extractedJokesOrFlavor: parsed.extractedJokesOrFlavor || undefined,
        suggestedDescription: parsed.suggestedDescription || undefined,
      };
    } catch (err) {
      console.warn('AI metadata extraction encountered an error (skipping gracefully):', err);
      return null;
    }
  }
}

export const aiMetadataService = new AIMetadataService();
