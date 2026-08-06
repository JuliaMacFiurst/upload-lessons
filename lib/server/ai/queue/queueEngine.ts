import fs from "fs";
import path from "path";
import type {
  QueueBatchJob,
  QueueJobItem,
  QueueJobStatus,
  ConfidenceScoreBreakdown,
} from "../types";

export type QueueOptions = {
  jobsDirectory?: string;
  maxAttemptsPerItem?: number;
};

/**
 * Universal Queue Engine for batch content factories.
 * Manages Jobs, Queues, Workers, Progress, Checkpoints, Resume, Retry, Skip, and Continuation.
 * Saves job state to local disk (.agents/jobs/) to survive IDE restarts.
 */
export class QueueEngine<TInput = unknown, TOutput = unknown> {
  private jobsDir: string;
  private maxAttempts: number;

  constructor(options: QueueOptions = {}) {
    this.jobsDir =
      options.jobsDirectory ||
      path.join(process.cwd(), ".agents", "jobs");
    this.maxAttempts = options.maxAttemptsPerItem || 2;
    this.ensureDirectory();
  }

  private ensureDirectory() {
    if (!fs.existsSync(this.jobsDir)) {
      fs.mkdirSync(this.jobsDir, { recursive: true });
    }
  }

  /**
   * Creates a new Batch Queue Job with input items.
   */
  public createBatchJob(
    skillId: string,
    title: string,
    items: Array<{ targetId: string; metadata?: Record<string, unknown>; input: TInput }>
  ): QueueBatchJob {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jobId = `job-${skillId}-${timestamp}`;
    const checkpointFile = path.join(this.jobsDir, `${jobId}.json`);

    const batchJob: QueueBatchJob = {
      id: jobId,
      skillId,
      title,
      totalItems: items.length,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      status: "PENDING",
      checkpointFile,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const jobItems: QueueJobItem<TInput, TOutput>[] = items.map((item, idx) => ({
      id: `${jobId}-item-${idx + 1}`,
      jobId,
      targetId: item.targetId,
      metadata: item.metadata,
      input: item.input,
      status: "PENDING",
      attempts: 0,
      maxAttempts: this.maxAttempts,
      stopConditionsTriggered: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    this.saveJobState(batchJob, jobItems);
    return batchJob;
  }

  /**
   * Loads an existing batch job state from local checkpoint file.
   */
  public loadBatchJob(jobId: string): {
    batchJob: QueueBatchJob;
    jobItems: QueueJobItem<TInput, TOutput>[];
  } | null {
    const checkpointFile = path.join(this.jobsDir, `${jobId}.json`);
    if (!fs.existsSync(checkpointFile)) {
      return null;
    }
    const content = fs.readFileSync(checkpointFile, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Saves updated job and items state to checkpoint file.
   */
  public saveJobState(
    batchJob: QueueBatchJob,
    jobItems: QueueJobItem<TInput, TOutput>[]
  ): void {
    batchJob.updatedAt = new Date().toISOString();
    const data = { batchJob, jobItems };
    fs.writeFileSync(batchJob.checkpointFile, JSON.stringify(data, null, 2));
  }

  /**
   * Updates an individual item's execution result in the queue.
   */
  public updateItemResult(
    jobId: string,
    itemId: string,
    updates: {
      status: QueueJobStatus;
      output?: TOutput;
      confidenceScore?: ConfidenceScoreBreakdown;
      stopConditionsTriggered?: string[];
      error?: string;
    }
  ): void {
    const state = this.loadBatchJob(jobId);
    if (!state) return;

    const item = state.jobItems.find((i) => i.id === itemId);
    if (!item) return;

    item.status = updates.status;
    item.attempts += 1;
    item.updatedAt = new Date().toISOString();

    if (updates.output !== undefined) item.output = updates.output;
    if (updates.confidenceScore) item.confidenceScore = updates.confidenceScore;
    if (updates.stopConditionsTriggered)
      item.stopConditionsTriggered = updates.stopConditionsTriggered;
    if (updates.error) item.error = updates.error;

    // Recalculate batch statistics
    state.batchJob.processedItems = state.jobItems.filter(
      (i) => i.status !== "PENDING" && i.status !== "PROCESSING"
    ).length;
    state.batchJob.successfulItems = state.jobItems.filter(
      (i) => i.status === "COMPLETED"
    ).length;
    state.batchJob.failedItems = state.jobItems.filter(
      (i) => i.status === "FAILED" || i.status === "SKIPPED"
    ).length;

    if (state.batchJob.processedItems === state.batchJob.totalItems) {
      state.batchJob.status =
        state.batchJob.failedItems === 0 ? "COMPLETED" : "FAILED";
    } else {
      state.batchJob.status = "PROCESSING";
    }

    this.saveJobState(state.batchJob, state.jobItems);
  }

  /**
   * Resumes a paused or interrupted batch job from its last checkpoint.
   */
  public getPendingItems(jobId: string): QueueJobItem<TInput, TOutput>[] {
    const state = this.loadBatchJob(jobId);
    if (!state) return [];
    return state.jobItems.filter(
      (item) => item.status === "PENDING" || (item.status === "FAILED" && item.attempts < item.maxAttempts)
    );
  }
}
