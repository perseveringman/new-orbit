declare global {
  interface PromiseConstructor {
    try?<T>(callback: () => T | PromiseLike<T>): Promise<T>;
  }
}

Promise.try ??= function tryPromise<T>(callback: () => T | PromiseLike<T>): Promise<T> {
  return new Promise((resolve) => resolve(callback()));
};

// @ts-expect-error pdf.js does not publish declarations for the worker bundle.
await import('pdfjs-dist/build/pdf.worker.min.mjs');

export {};
