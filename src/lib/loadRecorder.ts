let recorderPromise: Promise<void> | undefined;

/**
 * Ensures that /recorder.min.js from the public root is loaded once.
 */
export default function ensureRecorderLoaded() {
  if(typeof window === 'undefined') {
    return Promise.resolve();
  }

  if((window as any).Recorder) {
    return Promise.resolve();
  }

  if(recorderPromise) {
    return recorderPromise;
  }

  recorderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/recorder.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      recorderPromise = undefined;
      reject(err instanceof Event ? new Error('Failed to load recorder script') : err);
    };
    document.head.appendChild(script);
  });

  return recorderPromise;
}
