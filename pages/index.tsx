// pages/index.tsx

import React, { useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, AlignLeft, X } from "lucide-react";
import ProgressBar from "../components/ProgressBar";
import Button from "../components/Button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

// Update the type for analysisResults
type AnalysisResult = {
  extraction: string[];
  summary: string[];
  reconstruction: string;
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [extractedTexts, setExtractedTexts] = useState<string[]>([]);
  // Update the type for analysisResults
  const [analysisResults, setAnalysisResults] = useState<
    AnalysisResult[] | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const [currentChunk, setCurrentChunk] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState("details");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setUploadedFiles((prevFiles) => [
        ...prevFiles,
        ...Array.from(event.target.files || []),
      ]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  const handleFileUpload = async () => {
    if (uploadedFiles.length === 0) return;

    const newExtractedTexts: string[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      setCurrentFileIndex(i);
      setIsProcessing(true);
      setUploadStatus(
        `Uploading and processing file ${i + 1} of ${uploadedFiles.length}...`
      );
      setProgress(0);

      const formData = new FormData();
      formData.append("file", uploadedFiles[i]);

      try {
        const response = await fetch("/api/upload-pdf", {
          method: "POST",
          body: formData,
        });

        if (!response.body) {
          throw new Error("ReadableStream not yet supported in this browser.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(5).trim());

                if (data.progress !== undefined) {
                  setProgress(data.progress);
                }
                if (data.status) {
                  setUploadStatus(data.status);
                }
                if (data.extractedText) {
                  newExtractedTexts.push(data.extractedText);
                }
                if (data.error) {
                  throw new Error(data.error);
                }
              } catch (parseError) {
                console.error("Error parsing SSE data:", parseError);
              }
            }
          }
        }

        setUploadStatus(`Success! Document ${i + 1} processed.`);
      } catch (error) {
        console.error(`Error uploading file ${i + 1}:`, error);
        setUploadStatus(
          `Error uploading file ${i + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        setIsProcessing(false);
      }
    }

    setExtractedTexts(newExtractedTexts);
    setCurrentFileIndex(-1);
    setUploadStatus("All files processed.");
  };

  const handleSendToLLM = async () => {
    if (extractedTexts.length === 0) return;

    setIsProcessing(true);
    setUploadStatus("Adding files to processing queue...");
    setAnalysisResults([]); // Reset the results

    console.log("Starting analysis for", extractedTexts.length, "files");

    try {
      const response = await fetch("/api/summarize-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ texts: extractedTexts }),
      });

      if (!response.body) {
        throw new Error("ReadableStream not yet supported in this browser.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log("Stream complete");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");

        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (chunk.startsWith("data: ")) {
            try {
              const jsonStr = chunk.slice(5).trim();
              console.log("Received chunk:", jsonStr); // Add this line

              const data = JSON.parse(jsonStr);
              console.log("Parsed data:", data); // Add this line

              if (data.fileIndex !== undefined) {
                setCurrentFileIndex(data.fileIndex);
              }
              if (data.progress !== undefined) {
                setProgress(data.progress);
              }
              if (data.status) {
                setUploadStatus(data.status);
              }
              if (data.task) {
                setCurrentTask(data.task);
              }
              if (data.chunkInfo) {
                setCurrentChunk(data.chunkInfo);
              }
              if (data.results) {
                console.log(
                  "Received results for file",
                  data.fileIndex,
                  ":",
                  data.results
                ); // Add this line
                setAnalysisResults((prev) => {
                  const newResults = [...(prev || [])];
                  newResults[data.fileIndex] = data.results;
                  console.log("Updated results:", newResults); // Add this line
                  return newResults;
                });
              }
              if (data.completed) {
                console.log("Analysis completed");
                setIsProcessing(false);
                setUploadStatus("Analysis completed.");
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError);
              console.error("Problematic JSON string:", chunk.slice(5).trim());
            }
          }

          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      console.error("Error in sending files to queue:", error);
      setUploadStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      setIsProcessing(false);
    }
  };

  const startResultPolling = () => {
    // Implement a polling mechanism to get results from the server
    // This is a placeholder and needs to be implemented based on your backend setup
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/get-results");
        const data = await response.json();

        if (data.completed) {
          clearInterval(pollInterval);
          setUploadStatus("All files processed");
          setAnalysisResults(data.results);
        } else {
          setUploadStatus(
            `Processed ${data.processedCount} out of ${extractedTexts.length} files`
          );
        }
      } catch (error) {
        console.error("Error polling for results:", error);
      }
    }, 5000); // Poll every 5 seconds
  };

  // Update the type for the renderFormattedText function
  function renderFormattedText(text: string): ReactNode {
    const lines = text.split("\\n");
    const tabs: {
      details: ReactNode[];
      main: ReactNode[];
    } = {
      details: [],
      main: [],
    };

    let currentList: ReactNode[] = [];
    let isInList = false;
    let isInDetails = true;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      if (trimmedLine === "Dear Sir" || trimmedLine === "") {
        isInDetails = false;
        if (!isInList) {
          tabs.main.push(<br key={index} />);
        }
      } else if (line.startsWith("-")) {
        if (!isInList) {
          isInList = true;
          currentList = [];
        }
        currentList.push(
          <div key={index} className="m-1 p-1 bg-gray-700 rounded">
            {line}
          </div>
        );
      } else {
        if (isInList) {
          tabs.main.push(
            <div
              key={`list-${index}`}
              className="flex flex-wrap mb-4 p-2 border border-gray-600 rounded"
            >
              {(currentList as React.ReactElement[]).map((item, listIndex) => {
                let content = "";
                if (typeof item === "object" && item !== null) {
                  if (
                    React.isValidElement<{ children?: React.ReactNode }>(item)
                  ) {
                    content =
                      React.Children.map(item.props.children, (child) =>
                        typeof child === "string" ? child : null
                      )?.join("") || "";
                  } else if (
                    "props" in item &&
                    typeof item.props === "object" &&
                    item.props !== null &&
                    "children" in item.props
                  ) {
                    content =
                      String(
                        (item.props as { children?: React.ReactNode }).children
                      ) || "[Complex Object]";
                  } else {
                    content = "[Complex Object]";
                  }
                } else {
                  content = String(item);
                }

                // Only remove the "-" if it's the first character
                content = content.startsWith("-")
                  ? content.slice(1).trimStart()
                  : content;

                return (
                  <div key={listIndex} className="m-1 p-1 bg-gray-700 rounded">
                    {content}
                  </div>
                );
              })}
            </div>
          );
          currentList = [];
          isInList = false;
        }

        if (!isInDetails) {
          if (trimmedLine.startsWith("# ")) {
            tabs.main.push(
              <h1
                key={index}
                className="text-2xl font-bold mt-6 mb-4 text-purple-300 border-b-2 border-purple-300 pb-2"
              >
                {trimmedLine.slice(2)}
              </h1>
            );
          } else if (trimmedLine.startsWith("## ")) {
            tabs.main.push(
              <h2
                key={index}
                className="text-xl font-semibold mt-5 mb-3 text-pink-400 border-b border-pink-400 pb-1"
              >
                {trimmedLine.slice(3)}
              </h2>
            );
          } else if (trimmedLine.startsWith("### ")) {
            tabs.main.push(
              <h3
                key={index}
                className="text-lg font-medium mt-4 mb-2 text-blue-300"
              >
                {trimmedLine.slice(4)}
              </h3>
            );
          } else {
            tabs.main.push(
              <p key={index} className="mb-2 leading-relaxed">
                {line}
              </p>
            );
          }
        }
      }
    });

    if (isInList) {
      tabs.main.push(
        <div key="final-list" className="flex flex-wrap mb-4 rounded ">
          {(currentList as Array<{ [key: string]: any }>).map((item, index) => (
            <div key={index}>
              {(() => {
                if (typeof item === "object" && item !== null) {
                  const text: string | undefined =
                    (item["name"] as string) || (item["label"] as string) || "";
                  if (text && typeof text === "string") {
                    return text.replace(/^-\s*/, "");
                  }
                  // If no suitable property is found, return a placeholder
                  return "[Complex Object]";
                }
                return String(item).replace(/^-\s*/, "");
              })()}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap mb-4 pb-2">{tabs.details}</div>
        {tabs.main}
      </div>
    );
  }

  // Update the Button component props
  interface ButtonProps {
    onClick: () => void;
    disabled: boolean;
    icon: ReactNode;
    children: ReactNode;
    className?: string;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto p-8">
        <motion.header
          className="flex justify-between items-center mb-12"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="text-4xl font-bold text-purple-400">
            UFO Sightings Analyzer
          </h1>
        </motion.header>

        <motion.div
          className="bg-gray-800 p-8 rounded-lg shadow-2xl mb-12"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="mb-6 p-3 w-full border-2 border-gray-700 rounded-lg bg-gray-900 text-gray-100 focus:outline-none focus:border-purple-500 transition duration-300"
            disabled={isProcessing}
            multiple
          />

          {uploadedFiles.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold mb-2">Uploaded Files:</h4>
              <ul className="space-y-2">
                {uploadedFiles.map((file, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between bg-gray-700 p-2 rounded"
                  >
                    <span>{file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-400 hover:text-red-300"
                      disabled={isProcessing}
                    >
                      <X size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            onClick={handleFileUpload}
            disabled={isProcessing || uploadedFiles.length === 0}
            icon={<Upload className="mr-2" />}
          >
            Upload and Process
          </Button>

          <AnimatePresence>
            {uploadStatus && (
              <motion.p
                className="mt-4 text-center text-gray-300"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                {uploadStatus}
              </motion.p>
            )}
          </AnimatePresence>

          {isProcessing && (
            <div className="mt-6">
              <ProgressBar progress={progress} />
              <p className="mt-2 text-center text-gray-300">
                {`Processing file ${currentFileIndex + 1} of ${
                  uploadedFiles.length
                }`}
                {currentTask && ` - Current task: ${currentTask}`}
                {currentChunk && ` - ${currentChunk}`}
              </p>
            </div>
          )}
        </motion.div>

        <AnimatePresence>
          {extractedTexts.length > 0 && (
            <motion.div
              className="mb-12"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h3 className="text-xl font-semibold mb-4 text-purple-400">
                Extracted Texts:
              </h3>
              {extractedTexts.map((text, index) => (
                <div key={index} className="mb-4">
                  <h4 className="font-semibold text-pink-500 mb-2">
                    File {index + 1}:
                  </h4>
                  <textarea
                    value={text}
                    readOnly
                    className="w-full h-64 p-4 border-2 border-gray-700 rounded-lg bg-gray-900 text-gray-100 focus:outline-none focus:border-purple-500 transition duration-300"
                  />
                </div>
              ))}

              <Button
                onClick={handleSendToLLM}
                disabled={isProcessing}
                icon={<AlignLeft className="mr-2" />}
                className="mt-6"
              >
                Analyze All Texts
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {analysisResults && analysisResults.length > 0 && (
            <motion.div
              className="mb-12"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h3 className="text-xl font-semibold mb-4 text-purple-400">
                Analysis Results:
              </h3>

              {analysisResults.map(
                (result, fileIndex) =>
                  result && (
                    <div key={fileIndex} className="mb-8">
                      <h4 className="text-lg font-semibold text-pink-500 mb-4">
                        File {fileIndex + 1}:
                      </h4>
                      {["extraction", "summary", "reconstruction"].map(
                        (resultType) => (
                          <div key={resultType} className="mb-6">
                            <h5 className="font-semibold capitalize text-purple-300 mb-2">
                              {resultType}:
                            </h5>
                            {resultType === "reconstruction" && (
                              <div className="w-full p-4 border-2 border-gray-700 rounded-lg bg-gray-800 text-gray-100 overflow-auto">
                                {renderFormattedText(result.reconstruction)}
                              </div>
                            )}
                            {resultType !== "reconstruction" && (
                              <textarea
                                value={
                                  (
                                    result[
                                      resultType as "extraction" | "summary"
                                    ] || []
                                  ).join("\n") || ""
                                }
                                readOnly
                                className="w-full h-64 p-4 border-2 border-gray-700 rounded-lg bg-gray-900 text-gray-100 focus:outline-none focus:border-purple-500 transition duration-300"
                              />
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
