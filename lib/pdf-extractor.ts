// lib/pdf-extractor.ts
import * as pdfjsLib from 'pdfjs-dist';

// ENTERPRISE FIX: Use a CDN for the worker to prevent Next.js Webpack crashing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export async function extractTextFromLocalPDF(file: File): Promise<string> {
  try {
    // ENTERPRISE FIX: Dynamically import the library ONLY when a file is uploaded.
    // This completely bypasses the Next.js "Object.defineProperty" Webpack crash.
    const pdfjsLib = await import('pdfjs-dist');

    // Automatically map the worker to the exact installed version to prevent 404s
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Initialize the PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const maxPages = pdf.numPages;

    // Loop through every page and extract text blocks
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        // @ts-expect-error - Internal pdfjs-dist typing issue for 'str' property
        .map((item) => item.str)
        .join(' ');
        
      fullText += `[Page ${i}]: ${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("Client-side PDF Extraction Error:", error);
    throw new Error("Failed to read the PDF. Please ensure the file is not corrupted or password-protected.");
  }
}