import type { ProgressResponse } from "./types";
import {
  TranslationActivityOverlay,
  type OverlayLog,
} from "./TranslationActivityOverlay";

type Props = {
  progress: ProgressResponse | null;
  cancelLoading: boolean;
  onCancel: () => void;
};

export function TranslationProgress({ progress, cancelLoading, onCancel }: Props) {
  if (!progress) {
    return null;
  }

  const logs: OverlayLog[] = progress.logs.map((line) => ({
    message: line,
    level:
      /failed|error|invalid/i.test(line)
        ? "error"
        : /saved|validated|complete|finished/i.test(line)
          ? "success"
          : "info",
  }));

  return (
    <TranslationActivityOverlay
      open={progress.running}
      title="Translation Run Progress"
      running={progress.running}
      currentItem={progress.currentItem}
      processed={progress.processedItems}
      total={progress.totalItems}
      translated={progress.translatedItems}
      failed={progress.failedItems}
      logs={logs}
      actionLabel={
        cancelLoading
          ? "Stopping..."
          : progress.cancelRequested
            ? "Stop requested..."
            : "Stop run"
      }
      actionDisabled={!progress.running || cancelLoading || progress.cancelRequested}
      onAction={progress.running ? onCancel : undefined}
    />
  );
}
