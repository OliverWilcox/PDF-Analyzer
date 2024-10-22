import * as g4f from "g4f";

async function processTask(text: string, task: string): Promise<string> {
  let prompt = "";
  switch (task) {
    case "extract":
      prompt = `Extract all relevant data from the following UFO report text, presenting it in a structured JSON format. Include:
      
      1. Incident details (date, time, location, duration)
      2. UFO characteristics (shape, size, color, movement, effects)
      3. Witness information (number, types, credibility)
      4. Environmental conditions
      5. Official responses or investigations
      6. Physical or technical evidence
      7. Related incidents or patterns
      8. List all names mentioned in the document, categorized by their role (e.g., witnesses, investigators, officials, researchers)
      
      Ensure all data is consistently formatted and categorized. If information is missing or unclear, indicate this in the JSON. For names, include the context in which they appear if it's not clear from the category alone.
      
      Original text:
      ${text}
      
      Extracted JSON:`;
      break;
    case "summarize":
      prompt = `Provide a concise summary (150-200 words) of the following UFO report text, structured as follows:
      
      1. Incident Overview: Brief description of what happened, when, and where.
      2. UFO Description: Key characteristics of the observed phenomenon.
      3. Witness Accounts: Notable witness reactions or statements.
      4. Official Response: Any military or government involvement.
      5. Evidence: Physical, technical, or other evidence mentioned.
      6. Significance: What makes this report notable or unusual.
      
      Conclude with a brief statement on the report's credibility or implications.
      
      Original text:
      ${text}
      
      Summary:`;
      break;
    case "reconstruct":
      prompt = `Fully reconstruct and correct the following military intelligence report text, presenting it in a polished, official document format with clear sections. Your task:
      
        1. Fix all remaining OCR errors, typos, and formatting issues while maintaining the original content, structure, and meaning.
        2. Present the text in a clean, readable layout that mirrors the original document's structure, including proper paragraphing and appropriate line breaks.
        3. Maintain all original headings, subheadings, and document identifiers (e.g., form numbers, classification levels).
        4. Clearly separate and label different sections of the document as they appear in the original.
        5. Reconstruct any tables, lists, or structured data in a format that closely resembles the original.
        6. Preserve all dates, times, coordinates, and other specific data points exactly as they appear in the original text.
        7. Maintain the original formatting of military jargon, acronyms, and specialized terms. Do not expand acronyms unless explicitly done so in the original text.
        8. If any part of the text is garbled or unclear, indicate this with [unclear] rather than attempting to guess the content.
        9. Preserve the original paragraph structure and any intentional line breaks or spacing.
        10. Reconstruct any official letterhead or document identification information at the top of the document.
      
        After reconstruction, review your work to ensure it accurately represents the original document's content and structure. Present the final version as a well-formatted, official military intelligence report.
      
        Original text:
        ${text}
      
        Reconstructed text:`;
      break;
  }

  try {
    const response = await g4f.Provider.You.create_async({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant specialized in analyzing UFO sighting reports. Always provide your initial response, followed by a reflection on that response, and then a final corrected response based on your reflection.",
        },
        { role: "user", content: prompt },
      ],
    });
    return response.toString();
  } catch (error) {
    console.error(`Error in ${task} task:`, error);
    throw error;
  }
}

function parseResponse(response: string): {
  initial: string;
  reflection: string;
  final: string;
} {
  const parts = response.split("<reflection>");
  let initial = parts[0].trim();
  let reflection = "";
  let final = "";

  if (parts.length > 1) {
    reflection = parts[1].split("</reflection>")[0].trim();
    final = parts[1].split("</reflection>")[1]?.trim() || initial;
  } else {
    final = initial;
  }

  return { initial, reflection, final };
}

export async function analyzeText(extractedText: string): Promise<{
  extraction: { initial: string; reflection: string; final: string };
  summary: { initial: string; reflection: string; final: string };
  reconstruction: { initial: string; reflection: string; final: string };
}> {
  try {
    console.log("Starting analysis process...");

    const [extractionResponse, summaryResponse, reconstructionResponse] =
      await Promise.all([
        processTask(extractedText, "extract"),
        processTask(extractedText, "summarize"),
        processTask(extractedText, "reconstruct"),
      ]);

    const extraction = parseResponse(extractionResponse);
    const summary = parseResponse(summaryResponse);
    const reconstruction = parseResponse(reconstructionResponse);

    console.log("Analysis complete");
    return { extraction, summary, reconstruction };
  } catch (error: any) {
    console.error("Error in analysis process:", error.message);
    throw error;
  }
}
