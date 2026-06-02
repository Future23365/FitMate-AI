export type FlowExecutionResult<T, R> = {
  item: T;
  index: number;
  records: R[];
  error?: Error;
};

// flow 级队列只并发不同 flow；每个 flow 的内部轮次由调用方串行执行。
export async function runFlowQueue<T, R = unknown>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R[]>,
): Promise<Array<FlowExecutionResult<T, R>>> {
  const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
  const results: Array<FlowExecutionResult<T, R> | undefined> = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          item: items[index],
          index,
          records: await worker(items[index], index),
        };
      } catch (error) {
        results[index] = {
          item: items[index],
          index,
          records: [],
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(normalizedConcurrency, items.length) }, runWorker));

  return results.filter((result): result is FlowExecutionResult<T, R> => Boolean(result));
}
