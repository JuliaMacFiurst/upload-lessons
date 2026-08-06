import type { QueueBatchJob, QueueJobItem } from "./types";

export type ProductionSummaryReport = {
  statusHeader: string;
  processedCount: number;
  successfulCount: number;
  stoppedCount: number;
  requiresReviewCount: number;
  formattedText: string;
};

/**
 * Universal AI Runtime Summary Reporter.
 * Formats batch execution results into a clean, concise production report.
 * Full technical logs are available on explicit request.
 */
export class AIRuntimeReporter {
  public static formatSummaryReport<TInput, TOutput>(
    batchJob: QueueBatchJob,
    jobItems: QueueJobItem<TInput, TOutput>[]
  ): ProductionSummaryReport {
    const processedCount = batchJob.processedItems;
    const successfulCount = batchJob.successfulItems;
    const stoppedCount = batchJob.failedItems;

    // Items with confidence score < 95% require editor attention
    const requiresReviewCount = jobItems.filter(
      (item) =>
        item.status === "COMPLETED" &&
        item.confidenceScore &&
        item.confidenceScore.finalScorePercentage < 95
    ).length;

    const formattedText = [
      `✅ Выполнение завершено (${batchJob.skillId}).`,
      `Обработано: ${processedCount}`,
      `Успешно создано: ${successfulCount}`,
      `Остановлено (STOP): ${stoppedCount}`,
      `Требует проверки редактора: ${requiresReviewCount} (Confidence Score < 95%)`,
    ].join("\n");

    return {
      statusHeader: `✅ Выполнение завершено (${batchJob.skillId}).`,
      processedCount,
      successfulCount,
      stoppedCount,
      requiresReviewCount,
      formattedText,
    };
  }
}
