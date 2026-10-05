export type NarrationBatchItem = {
  slideId: string;
  dirty: boolean;
  save: () => Promise<boolean>;
};

export type NarrationBatchResult = {
  attempted: number;
  saved: string[];
  failed: string[];
  skipped: string[];
};

/** Saves only browser-local final takes. Each item is isolated so one failure does not retry successful slides. */
export async function saveDirtyNarrations(items: NarrationBatchItem[]): Promise<NarrationBatchResult> {
  const result: NarrationBatchResult = { attempted: 0, saved: [], failed: [], skipped: [] };
  for (const item of items) {
    if (!item.dirty) {
      result.skipped.push(item.slideId);
      continue;
    }
    result.attempted += 1;
    try {
      if (await item.save()) result.saved.push(item.slideId);
      else result.failed.push(item.slideId);
    } catch {
      result.failed.push(item.slideId);
    }
  }
  return result;
}
