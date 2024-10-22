import OpenAI from "openai";
import { setTimeout } from "timers/promises";
import { addCustomDictionary } from "./ufo-terms";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = "gpt-4o-mini";

const CHUNK_SIZE = 4000; // Kept for reconstruction task
const CHUNK_OVERLAP = 300;
const LARGE_CHUNK_SIZE = 15000; // New larger chunk size for extract and summary tasks

function createChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex < text.length) {
      // Find the last period or line break within the chunk size
      const lastBreak = text.substring(startIndex, endIndex).lastIndexOf("\n");
      const lastPeriod = text.substring(startIndex, endIndex).lastIndexOf(".");
      endIndex = startIndex + Math.max(lastBreak, lastPeriod, chunkSize);
    }

    chunks.push(text.substring(startIndex, endIndex));
    startIndex = endIndex - CHUNK_OVERLAP; // Overlap chunks
  }

  return chunks;
}

async function analyzeChunk(
  chunk: string,
  task: string,
  chunkIndex: number,
  totalChunks: number,
  retryCount = 0
): Promise<string> {
  const maxRetries = 3;
  const maxTokens = 15000;

  let prompt = "";
  switch (task) {
    case "extract":
      prompt = `Extract key details from the following declassified report text (part ${
        chunkIndex + 1
      } of ${totalChunks}). Focus on people mentioned, names, dates, locations, times, visuals, sightings and significant events. Provide a concise, bullet-point list:\n\n${chunk}`;
      break;
    case "summarize":
      prompt = `Provide a brief summary of the following report text and a conclusion to how impactful it may or may not be (part ${
        chunkIndex + 1
      } of ${totalChunks}) in 2-3 sentences:\n\n${chunk}`;
      break;
    case "reconstruct":
      prompt = `Task: Accurately transcribe, spell correct, and format the following text from a declassified government document into a well-structured article format using Markdown syntax for headers and paragraphs.

Instructions:
1. Preserve ALL dates, locations, technical terms, and acronyms exactly as they appear.
2. Correct misspelled names of people, ensuring you use the correct spelling for well-known figures in the UFO field and other government fields.
3. Maintain ALL CAPS text where it appears in the original.
4. Correct obvious OCR errors but keep intentional abbreviations or jargon.
5. For unclear text, use [UNCLEAR: best guess].
6. For illegible text, use [ILLEGIBLE].
7. For handwritten notes, use [HANDWRITTEN: transcription].
8. For form fields: If blank, use [BLANK]. If filled, use [FIELD: content].
9. Improve readability with proper punctuation and grammar where necessary.
10. Use Markdown headers (# for main sections, ## for subsections, ### for sub-subsections) to structure the content.
11. Ensure each header is on its own line, preceded by a blank line.
12. Create paragraphs by grouping related sentences together. Only start a new paragraph when there's a significant change in topic or focus.
13. Use "-" for all list items, regardless of nesting level or original format.
14. Do not add extra line breaks within paragraphs unless absolutely necessary for readability.
15. Do not add any explanations or summaries.
16. Ensure proper spacing around headers and between paragraphs.

Provide the transcribed, formatted, and structured text, aiming for 100% accuracy in reproducing the original content while enhancing readability and structure. Ensure proper Markdown formatting is applied and paragraphs are logically grouped.

Text to reconstruct (part ${chunkIndex + 1} of ${totalChunks}):

${chunk}`;
      break;
    default:
      throw new Error(`Unknown task: ${task}`);
  }

  try {
    console.log(`Processing ${task} chunk ${chunkIndex + 1}/${totalChunks}`);
    console.log(`Chunk length: ${chunk.length} characters`);

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    });

    const response = completion.choices[0].message?.content || "";

    if (response.toLowerCase().includes("sorry") || response.length < 50) {
      throw new Error("Unexpected response from AI model");
    }

    console.log(`Response length: ${response.length} characters`);
    return response;
  } catch (error) {
    console.error(`Error in ${task}, chunk ${chunkIndex + 1}:`, error);

    if (retryCount < maxRetries) {
      console.log(
        `Retrying ${task} chunk ${chunkIndex + 1} (Attempt ${retryCount + 1})`
      );
      await setTimeout(2000 * (retryCount + 1)); // Exponential backoff
      return analyzeChunk(chunk, task, chunkIndex, totalChunks, retryCount + 1);
    } else {
      console.warn(
        `Max retries reached for ${task} chunk ${
          chunkIndex + 1
        }. Using original text.`
      );
      return chunk;
    }
  }
}

function combineReconstructedChunks(chunks: string[]): string {
  let combined = chunks.join("\n\n");

  // Remove duplicate headers
  const headerRegex = /^#{2,3} .+$/gm;
  const headers = new Set();
  combined = combined.replace(headerRegex, (match) => {
    if (headers.has(match)) {
      return "";
    }
    headers.add(match);
    return match;
  });

  // Remove any empty lines between headers and content
  combined = combined.replace(/(?<=^#{2,3} .+$)\n+/gm, "\n");

  // Ensure there's always a blank line after a header
  combined = combined.replace(/(^#{2,3} .+$)/gm, "$1\n");

  // Ensure paragraphs are separated by blank lines
  combined = combined.replace(/([^\n])\n([^\n#])/g, "$1\n\n$2");

  return combined.trim();
}

export async function analyzeText(
  extractedText: string,
  fileIndex: number,
  onProgress: (
    fileIndex: number,
    progress: number,
    status: string,
    task: string,
    chunkInfo: string
  ) => void
): Promise<{
  extraction: string[];
  summary: string[];
  reconstruction: string;
}> {
  const tasks = ["extract", "summarize", "reconstruct"];
  const results: { [key: string]: string[] } = {
    extract: [],
    summarize: [],
    reconstruct: [],
  };

  for (const task of tasks) {
    const chunkSize = task === "reconstruct" ? CHUNK_SIZE : LARGE_CHUNK_SIZE;
    const chunks = createChunks(extractedText, chunkSize);

    for (let i = 0; i < chunks.length; i++) {
      onProgress(
        fileIndex,
        (i / chunks.length) * 100,
        `Processing ${task} task`,
        task,
        `Chunk ${i + 1} of ${chunks.length}`
      );
      const result = await analyzeChunk(chunks[i], task, i, chunks.length);
      results[task].push(result);
    }
  }

  const finalSummary = results.summarize.join(" ");
  let reconstruction = postProcessReconstruction(
    combineReconstructedChunks(results.reconstruct)
  );

  return {
    extraction: results.extract,
    summary: [finalSummary],
    reconstruction: reconstruction,
  };
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n") // Normalize line breaks
    .replace(/\n{3,}/g, "\n\n") // Reduce multiple line breaks
    .trim();
}

function postProcessReconstruction(reconstruction: string): string {
  console.log("Original reconstruction:", reconstruction);
  let processed = reconstruction
    .replace(/\\n/g, "\n") // Replace escaped newlines with actual newlines
    .replace(/\n{3,}/g, "\n\n") // Replace 3 or more consecutive newlines with 2
    .trim();

  // Ensure proper spacing around headers
  processed = processed.replace(/^(#{1,3} .+)$/gm, "\n$1\n");

  // Improve paragraph detection
  processed = processed.replace(/([^\n])\n(?![#\-\d])([^\n])/g, "$1 $2");

  // Ensure proper list formatting
  processed = processed.replace(/^(\s*[-\d]\.?\s+)/gm, "\n$1");

  // Remove extra spaces at the beginning of lines
  processed = processed.replace(/^\s+/gm, "");

  // Ensure double line breaks between paragraphs and after headers
  processed = processed.replace(/\n(?!\n)/g, "\n\n");

  // Remove triple or more line breaks
  processed = processed.replace(/\n{3,}/g, "\n\n");

  console.log("Processed reconstruction:", processed);
  return processed;
}

function improveReadability(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])(?=[a-zA-Z])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function preprocessText(text: string): string {
  return text
    .replace(/^(#+)\s+(.+)$/gm, (_, hashes, title) => {
      // Convert section headers to proper Markdown
      const level = hashes.length;
      return `\n${"#".repeat(level)} ${title}\n`;
    })
    .replace(/^(\d+)\.?\s+(.+)$/gm, (_, number, title) => {
      // Convert numbered sections to headers
      return `\n### ${number}. ${title}\n`;
    })
    .replace(/^([a-z])\.\s+(.+)$/gm, (_, letter, content) => {
      // Convert lettered subsections to subheaders
      return `\n#### ${letter}. ${content}\n`;
    })
    .replace(/^\((\d+)\)\s+(.+)$/gm, (_, number, content) => {
      // Convert numbered items in parentheses to list items
      return `\n- ${number}) ${content}`;
    })
    .replace(/^\(([a-z])\)\s+(.+)$/gm, (_, letter, content) => {
      // Convert lettered items in parentheses to nested list items
      return `\n  - ${letter}) ${content}`;
    })
    .replace(/^([A-Z\s]+):$/gm, (_, title) => {
      // Convert all-caps lines ending with colon to headers
      return `\n## ${title}\n`;
    })
    .replace(/\n{3,}/g, "\n\n") // Replace 3 or more consecutive newlines with 2
    .trim();
}
