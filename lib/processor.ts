// lib/pdfProcessor.ts

import { createWorker, createScheduler } from "tesseract.js";
import { convertPDFToImages } from "./pdfToImagesConverter";
import sharp from "sharp";
import fs from "fs/promises";
import { addCustomDictionary } from "./ufo-terms";
import pLimit from "p-limit";

async function preprocessImage(imagePath: string): Promise<Buffer> {
  return sharp(imagePath)
    .greyscale()
    .normalize()
    .sharpen()
    .threshold(128)
    .toBuffer();
}

export async function extractTextFromPDF(
  imagePaths: string[],
  onProgress: (progress: number, status: string) => void
): Promise<string> {
  try {
    const scheduler = createScheduler();
    const numWorkers = Math.min(4, imagePaths.length); // Use up to 4 workers or the number of images, whichever is smaller

    for (let i = 0; i < numWorkers; i++) {
      const worker = await createWorker("eng");
      await scheduler.addWorker(worker);
    }

    const limit = pLimit(numWorkers);
    const totalImages = imagePaths.length;
    let processedImages = 0;

    const extractedTexts = await Promise.all(
      imagePaths.map((imagePath, index) =>
        limit(async () => {
          console.log(`Processing image ${index + 1} of ${totalImages}`);
          const preprocessedImage = await preprocessImage(imagePath);
          const result = await scheduler.addJob(
            "recognize",
            preprocessedImage,
            {
              preserve_interword_spaces: "1",
              tessedit_pageseg_mode: "1",
              tessedit_char_whitelist:
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?()-:;/ \n",
            }
          );
          await fs.unlink(imagePath);
          const progress =
            30 + Math.round(((index + 1) / imagePaths.length) * 50);
          onProgress(
            progress,
            `Processed ${index + 1} of ${imagePaths.length} images`
          );
          return result.data.text;
        })
      )
    );

    await scheduler.terminate();

    return extractedTexts.join("\n\n").trim();
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw error;
  }
}

function postProcessText(text: string): string {
  return text
    .replace(/(\w)\s+(?=[,.!?])/g, "$1") // Remove spaces before punctuation
    .replace(/(\w+)-\s*\n(\w+)/g, "$1$2") // Join hyphenated words split across lines
    .replace(/([^\s])\s*\n\s*([^\s])/g, "$1 $2") // Join words split across lines
    .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines to double newlines
    .replace(/\s{2,}/g, " ") // Reduce multiple spaces to single spaces
    .trim();
}

export async function processPDF(
  pdfPath: string,
  onProgress: (progress: number, status: string) => void,
  chunkSize: number = 4000
): Promise<string[]> {
  console.log("Starting PDF processing");
  onProgress(20, "Converting PDF to images...");
  const imagePaths = await convertPDFToImages(pdfPath);
  console.log(`Converted PDF to ${imagePaths.length} images`);

  onProgress(30, "Starting text extraction from images...");
  const extractedText = await extractTextFromPDF(imagePaths, onProgress);
  console.log("Finished text extraction");

  onProgress(80, "Post-processing extracted text...");
  const postProcessedText = postProcessText(extractedText);
  const textWithCustomDictionary = addCustomDictionary(postProcessedText);
  console.log("Finished post-processing");

  onProgress(90, "Chunking text...");
  const chunks = chunkText(textWithCustomDictionary, chunkSize);
  console.log(`Created ${chunks.length} text chunks`);

  return chunks;
}

export function chunkText(text: string, chunkSize: number = 4000): string[] {
  const chunks = [];
  const lines = text.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if (
      currentChunk.length + line.length + 1 > chunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += line + "\n";
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
