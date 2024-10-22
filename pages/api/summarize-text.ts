// pages/api/summarize-text.ts

import { NextApiRequest, NextApiResponse } from "next";
import { analyzeText } from "../../lib/analyzerService";

const BATCH_SIZE = 5; // Process 5 files at a time
const MAX_CHUNK_SIZE = 50000; // Adjust this value as needed

function safeStringify(obj: any) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "string") {
      return value
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/"/g, '\\"');
    }
    return value;
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const { texts } = req.body;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const sendProgress = (
      fileIndex: number,
      progress: number,
      status: string,
      task: string,
      chunkInfo: string
    ) => {
      const data = safeStringify({
        fileIndex,
        progress,
        status,
        task,
        chunkInfo,
      });

      if (data.length > MAX_CHUNK_SIZE) {
        const chunks =
          data.match(new RegExp(`.{1,${MAX_CHUNK_SIZE}}`, "g")) || [];
        chunks.forEach((chunk, index) => {
          res.write(`data: ${chunk}\n\n`);
          if (index < chunks.length - 1) {
            res.write(`data: {"continueFrom":${index + 1}}\n\n`);
          }
        });
      } else {
        res.write(`data: ${data}\n\n`);
      }
      res.flush();
    };

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const fileIndex = i + j;
        try {
          const fileResult = await analyzeText(
            batch[j],
            fileIndex,
            sendProgress
          );
          res.write(
            `data: ${safeStringify({ fileIndex, results: fileResult })}\n\n`
          );
          res.flush();
        } catch (error) {
          console.error(`Error in text analysis for file ${fileIndex}:`, error);
          res.write(
            `data: ${safeStringify({
              fileIndex,
              error: `An error occurred during analysis of file ${
                fileIndex + 1
              }`,
            })}\n\n`
          );
          res.flush();
        }
      }

      if (global.gc) {
        global.gc();
      }
    }

    res.write(`data: ${safeStringify({ completed: true })}\n\n`);
    res.flush();
    res.end();
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
