/**
 * lib/file-parsers.ts
 *
 * Single dispatch point for turning any non-image chat attachment into plain
 * text the model can read. Every format collapses to the same output shape
 * (ParsedAttachment) so the caller in app/api/chat/route.ts never needs to
 * know which parser ran.
 *
 * Design constraints this file is built around:
 *  - One bad file must never take down a whole request. Every parser throws
 *    a typed, readable Error on failure; the caller wraps each call in
 *    Promise.allSettled so failures are isolated per-file.
 *  - Every parser enforces a size ceiling before doing real work, so a
 *    malicious or oversized upload fails fast instead of pinning CPU.
 *  - Output is length-capped per file. A 50,000-row spreadsheet dumped
 *    verbatim into a prompt is not useful context, it is a cost and
 *    cache-invalidation problem. Truncation is explicit and reported back
 *    to the model via `warnings`, never silent.
 */

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

import Papa from 'papaparse';

// ============================================================================
// TYPES
// ============================================================================

export type SupportedAttachmentType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'xls'
  | 'csv'
  | 'md'
  | 'txt';

/** Shape the client is expected to send for every non-image attachment. */
export interface RawAttachment {
  /** Original filename, including extension (e.g. "q3-performance.xlsx"). */
  name: string;
  /** Browser-reported MIME type. Used as a hint; extension is authoritative. */
  mimeType: string;
  /** Either a raw base64 string or a full data URL ("data:<mime>;base64,..."). */
  base64: string;
}

export interface ParsedAttachment {
  name: string;
  type: SupportedAttachmentType;
  extractedText: string;
  /** Non-fatal issues surfaced to the model (truncation, empty sheets, etc). */
  warnings: string[];
}

// ============================================================================
// LIMITS
// ============================================================================

/** Hard ceiling on decoded file size. Keeps parsing CPU and memory bounded. */
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Per-file ceiling on extracted text. Protects prompt size and cache stability. */
const MAX_EXTRACTED_CHARS = 100_000;

/** Row ceiling for spreadsheet/CSV sheets before truncation kicks in. */
const MAX_TABLE_ROWS = 500;

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export async function parseAttachment(raw: RawAttachment): Promise<ParsedAttachment> {
  if (!raw || typeof raw.base64 !== 'string' || raw.base64.length === 0) {
    throw new Error('Attachment payload is empty or malformed.');
  }

  const type = resolveAttachmentType(raw.name, raw.mimeType);
  const buffer = decodeBase64(raw.base64);

  if (buffer.byteLength === 0) {
    throw new Error('Decoded attachment is empty.');
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `File exceeds the ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))}MB limit (${(
        buffer.byteLength /
        (1024 * 1024)
      ).toFixed(1)}MB).`
    );
  }

  const warnings: string[] = [];
  let extractedText: string;

  switch (type) {
    case 'pdf':
      extractedText = await parsePdf(buffer);
      break;
    case 'docx':
      extractedText = await parseDocx(buffer);
      break;
    case 'xlsx':
    case 'xls':
      extractedText = parseSpreadsheet(buffer, warnings);
      break;
    case 'csv':
      extractedText = parseCsv(buffer, warnings);
      break;
    case 'md':
    case 'txt':
      extractedText = buffer.toString('utf-8');
      break;
    default:
      // Exhaustiveness guard — resolveAttachmentType never returns outside the union.
      throw new Error(`Unsupported attachment type for "${raw.name}".`);
  }

  const { text: cappedText, truncated } = capText(extractedText, MAX_EXTRACTED_CHARS);
  if (truncated) {
    warnings.push(
      `Extracted text truncated to ${MAX_EXTRACTED_CHARS.toLocaleString()} characters.`
    );
  }

  return {
    name: raw.name,
    type,
    extractedText: cappedText.trim() || '[No extractable text content found.]',
    warnings,
  };
}

// ============================================================================
// TYPE RESOLUTION
// ============================================================================

const MIME_TO_TYPE: Record<string, SupportedAttachmentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/markdown': 'md',
  'text/plain': 'txt',
};

const EXTENSION_TO_TYPE: Record<string, SupportedAttachmentType> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  xls: 'xls',
  csv: 'csv',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
};

function resolveAttachmentType(name: string, mimeType: string): SupportedAttachmentType {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';

  // Extension is authoritative: browsers frequently report generic or wrong
  // MIME types (e.g. "application/octet-stream") for common file types.
  if (EXTENSION_TO_TYPE[extension]) {
    return EXTENSION_TO_TYPE[extension];
  }

  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  if (MIME_TO_TYPE[normalizedMime]) {
    return MIME_TO_TYPE[normalizedMime];
  }

  throw new Error(
    `Unsupported file type for "${name}" (mime: ${mimeType || 'unknown'}). ` +
      `Supported: pdf, docx, xlsx, xls, csv, md, txt.`
  );
}

// ============================================================================
// DECODING
// ============================================================================

function decodeBase64(input: string): Buffer {
  const raw = input.includes(',') ? input.split(',')[1] : input;
  return Buffer.from(raw, 'base64');
}

// ============================================================================
// FORMAT-SPECIFIC PARSERS
// ============================================================================

async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const rawModule = await import('pdf-parse');
    const parseFunction = (
      'default' in rawModule ? (rawModule as Record<string, any>).default : rawModule
    ) as (buf: Buffer) => Promise<{ text: string }>;
    const result = await parseFunction(buffer);
    return result.text;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF parsing failed: ${msg}`);
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DOCX parsing failed: ${msg}`);
  }
}

function parseSpreadsheet(buffer: Buffer, warnings: string[]): string {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sections: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
      });

      if (rows.length === 0) {
        warnings.push(`Sheet "${sheetName}" is empty and was skipped.`);
        continue;
      }

      const truncated = rows.length > MAX_TABLE_ROWS;
      const visibleRows = truncated ? rows.slice(0, MAX_TABLE_ROWS) : rows;
      if (truncated) {
        warnings.push(
          `Sheet "${sheetName}" has ${rows.length} rows; only the first ${MAX_TABLE_ROWS} are included.`
        );
      }

      const csvBody = visibleRows
        .map((row) => row.map((cell) => stringifyCell(cell)).join(','))
        .join('\n');

      sections.push(`--- Sheet: ${sheetName} ---\n${csvBody}`);
    }

    if (sections.length === 0) {
      warnings.push('Workbook contained no non-empty sheets.');
    }

    return sections.join('\n\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Spreadsheet parsing failed: ${msg}`);
  }
}

function parseCsv(buffer: Buffer, warnings: string[]): string {
  const raw = buffer.toString('utf-8');

  // Validate parseability up front so a corrupt file fails clearly rather
  // than being silently passed through as garbage text.
  const parsed = Papa.parse(raw, { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    warnings.push(
      `CSV parser reported ${parsed.errors.length} formatting issue(s); content is still included as-is.`
    );
  }

  const rowCount = (parsed.data as unknown[]).length;
  if (rowCount > MAX_TABLE_ROWS) {
    const lines = raw.split('\n');
    warnings.push(`CSV has ${rowCount} rows; only the first ${MAX_TABLE_ROWS} are included.`);
    return lines.slice(0, MAX_TABLE_ROWS + 1).join('\n'); // +1 to keep the header row
  }

  return raw;
}

function stringifyCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  const str = String(cell);
  // Quote cells containing commas or quotes so the flattened CSV stays valid.
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function capText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}