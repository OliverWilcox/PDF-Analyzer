// lib/pdfToImagesConverter.ts

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { v4 as uuidv4 } from "uuid";

export async function convertPDFToImages(pdfPath: string): Promise<string[]> {
  const outputDir = path.join(process.cwd(), "temp");
  const uniqueId = uuidv4();
  const outputPattern = path.join(outputDir, `${uniqueId}-page-%d.png`);

  // Ensure the output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    exec(
      `pdftoppm -png "${pdfPath}" "${path.join(outputDir, uniqueId)}"`,
      async (error) => {
        if (error) {
          console.error("Error converting PDF to images:", error);
          reject(error);
          return;
        }

        try {
          const files = await fs.readdir(outputDir);
          const imagePaths = files
            .filter((file) => file.startsWith(`${uniqueId}-`))
            .map((file) => path.join(outputDir, file));

          resolve(imagePaths);
        } catch (err) {
          console.error("Error reading output directory:", err);
          reject(err);
        }
      }
    );
  });
}
