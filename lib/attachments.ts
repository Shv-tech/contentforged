/**
 * lib/attachments.ts
 *
 * Client-side counterpart to lib/file-parsers.ts.
 *
 * The browser does NOT parse anything. Its only job is to classify a dropped
 * or selected file, enforce the size ceiling before we waste time on a
 * base64 round-trip, and hand the server a well-formed payload. All actual
 * text extraction (pdf, docx, xlsx, xls, csv, md, txt) happens server-side in
 * lib/file-parsers.ts, which is the single source of truth for parsing.
 *
 * This replaces the previous split-brain arrangement where chat parsed PDFs
 * in the browser via pdfjs-dist while brand-DNA uploads parsed them on the
 * server via pdf-parse. Two parsers for one format meant two failure modes,
 * two sets of limits, and two things to maintain. lib/pdf-extractor.ts is
 * now dead and can be deleted.
 */

/** Mirrors RawAttachment in lib/file-parsers.ts. Keep the two in sync. */
export interface RawAttachment {
  name: string;
  mimeType: string;
  /** Full data URL ("data:<mime>;base64,..."). The server tolerates either form. */
  base64: string;
}

export interface PendingDocument extends RawAttachment {
  /** Stable key for React lists and removal. */
  id: string;
  size: number;
}

export type FileKind = 'image' | 'document' | 'unsupported';

/**
 * Extensions accepted as documents. Must stay a subset of what
 * lib/file-parsers.ts can actually resolve, or the server will reject the
 * file after the user has already waited for an upload.
 */
export const DOCUMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'xlsx',
  'xls',
  'csv',
  'md',
  'markdown',
  'txt',
] as const;

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

/** Value for an <input type="file"> accept attribute. */
export const ACCEPT_ATTRIBUTE = [
  ...IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
  ...DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/** Anthropic rejects images above ~5MB after base64 encoding. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Matches MAX_FILE_BYTES in lib/file-parsers.ts. Do not raise one alone. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const MAX_IMAGES_PER_MESSAGE = 10;
export const MAX_DOCUMENTS_PER_MESSAGE = 10;

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function classifyFile(file: File): FileKind {
  const extension = getExtension(file.name);

  // Extension first, MIME second. Browsers report generic or wrong MIME types
  // constantly (application/octet-stream for .md, application/vnd.ms-excel
  // for .csv), so the filename is the more reliable signal.
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(extension)) return 'image';
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) return 'document';

  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || file.type.startsWith('text/')) return 'document';

  return 'unsupported';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export async function fileToPendingDocument(file: File): Promise<PendingDocument> {
  const base64 = await fileToDataUrl(file);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    // Normalize the empty MIME type browsers hand back for unknown extensions.
    mimeType: file.type || 'application/octet-stream',
    base64,
    size: file.size,
  };
}

export interface SortedFiles {
  images: string[];
  documents: PendingDocument[];
  /** Human-readable reasons, one per rejected file, for a single toast. */
  rejected: string[];
}

/**
 * Converts a raw FileList/array into send-ready payloads, rejecting anything
 * oversized or unsupported. Never throws: a bad file in a multi-file drop
 * must not discard the good ones alongside it.
 */
export async function sortAndEncodeFiles(
  files: File[],
  existingImageCount: number,
  existingDocumentCount: number
): Promise<SortedFiles> {
  const result: SortedFiles = { images: [], documents: [], rejected: [] };

  for (const file of files) {
    const kind = classifyFile(file);

    if (kind === 'unsupported') {
      result.rejected.push(`${file.name}: unsupported file type`);
      continue;
    }

    if (kind === 'image') {
      if (existingImageCount + result.images.length >= MAX_IMAGES_PER_MESSAGE) {
        result.rejected.push(`${file.name}: image limit of ${MAX_IMAGES_PER_MESSAGE} reached`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        result.rejected.push(`${file.name}: images must be under ${formatBytes(MAX_IMAGE_BYTES)}`);
        continue;
      }
      try {
        result.images.push(await fileToDataUrl(file));
      } catch {
        result.rejected.push(`${file.name}: could not be read`);
      }
      continue;
    }

    if (existingDocumentCount + result.documents.length >= MAX_DOCUMENTS_PER_MESSAGE) {
      result.rejected.push(`${file.name}: document limit of ${MAX_DOCUMENTS_PER_MESSAGE} reached`);
      continue;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      result.rejected.push(`${file.name}: documents must be under ${formatBytes(MAX_DOCUMENT_BYTES)}`);
      continue;
    }
    try {
      result.documents.push(await fileToPendingDocument(file));
    } catch {
      result.rejected.push(`${file.name}: could not be read`);
    }
  }

  return result;
}

/** Strips the id/size fields the API does not need. */
export function toRawAttachment(doc: PendingDocument): RawAttachment {
  return { name: doc.name, mimeType: doc.mimeType, base64: doc.base64 };
}