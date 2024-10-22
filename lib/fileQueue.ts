import { analyzeText } from "./analyzerService";

interface QueueItem {
  text: string;
  fileIndex: number;
}

class FileQueue {
  private queue: QueueItem[] = [];
  private isProcessing: boolean = false;

  addToQueue(text: string, fileIndex: number) {
    this.queue.push({ text, fileIndex });
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const { text, fileIndex } = this.queue.shift()!;

    try {
      const result = await analyzeText(
        text,
        fileIndex,
        (fileIndex, progress, status, task, chunkInfo) => {
          // You can implement progress reporting here if needed
          console.log(`File ${fileIndex}: ${status} - ${progress}%`);
        }
      );

      // Here you can send the result back to the client or save it
      console.log(`File ${fileIndex} processed successfully`);
      // Implement your logic to send results back to the client here
    } catch (error) {
      console.error(`Error processing file ${fileIndex}:`, error);
      // Implement your error handling logic here
    }

    // Process the next file in the queue
    this.processQueue();
  }
}

export const fileQueue = new FileQueue();
