// pages/api/upload-pdf.ts

import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { processPDF } from "../../lib/processor";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const sendProgress = (progress: number, status: string) => {
      res.write(`data: ${JSON.stringify({ progress, status })}\n\n`);
    };

    const uploadDir = path.join(process.cwd(), "/uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    sendProgress(0, "Starting file upload...");

    const form = formidable({
      uploadDir: uploadDir,
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024, // 10MB limit
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Error parsing form:", err);
        sendProgress(0, "Error parsing form");
        return res.end();
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file || !file.filepath) {
        console.error("File path is undefined");
        sendProgress(0, "No file uploaded or invalid file");
        return res.end();
      }

      sendProgress(10, "File uploaded, starting processing...");

      try {
        const textChunks = await processPDF(file.filepath, sendProgress);
        const extractedText = textChunks.join("\n");

        sendProgress(100, "Processing complete");
        res.write(`data: ${JSON.stringify({ extractedText })}\n\n`);
      } catch (error: any) {
        console.error("Error processing PDF:", error);
        sendProgress(0, error.message || "Error processing PDF");
      } finally {
        // Clean up the uploaded file
        fs.unlinkSync(file.filepath);
        res.end();
      }
    });
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
