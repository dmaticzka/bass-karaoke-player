import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView — provide a no-op stub
window.HTMLElement.prototype.scrollIntoView = function () {};

// jsdom doesn't implement HTMLCanvasElement.getContext — provide a no-op stub
// so tests that render components using <canvas> don't produce noisy warnings.
HTMLCanvasElement.prototype.getContext = function () {
  return null;
} as typeof HTMLCanvasElement.prototype.getContext;
