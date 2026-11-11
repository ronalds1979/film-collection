import { lookupMetadata } from './server/services/metadata.js';
import { performance } from 'perf_hooks';

const runBenchmark = async () => {
  // Mock fetch to simulate API latency
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: true,
          json: async () => ({ results: [], Search: [] })
        });
      }, 50); // 50ms simulated latency
    });
  };

  // Mock env vars to trigger API path
  process.env.TMDB_API_KEY = 'mock';
  process.env.OMDB_API_KEY = 'mock';

  console.log("Starting benchmark (10 lookups)...");
  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    await lookupMetadata('Inception');
  }
  const end = performance.now();

  console.log(`Total time: ${end - start} ms`);
  console.log(`Average time per lookup: ${(end - start) / 10} ms`);

  // Restore
  global.fetch = originalFetch;
};

runBenchmark();
