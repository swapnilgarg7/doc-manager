/** Run async jobs with a bounded number in flight at once. */
export async function runPool(
  jobs: (() => Promise<unknown>)[],
  concurrency: number
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        await job();
      }
    }
  );
  await Promise.all(workers);
}
