const worker = new Worker(new URL('../workers/formula.worker.js', import.meta.url), {
  type: 'module'
});

let nextMessageId = 1;
const callbacks = new Map();

worker.onmessage = ({ data }) => {
  const { id, result, error } = data || {};
  const cb = callbacks.get(id);
  if (!cb) return;
  callbacks.delete(id);
  if (error) {
    cb.reject(new Error(error));
  } else {
    cb.resolve(result);
  }
};

export function evaluateFormulaInWorker(formula, row, decimalPlaces = 2, roundingMode = 'round') {
  return new Promise((resolve, reject) => {
    const id = nextMessageId++;
    callbacks.set(id, { resolve, reject });
    worker.postMessage({ id, formula, row, decimalPlaces, roundingMode });
    setTimeout(() => {
      if (callbacks.has(id)) {
        callbacks.delete(id);
        reject(new Error('公式计算超时'));
      }
    }, 5000);
  });
}
