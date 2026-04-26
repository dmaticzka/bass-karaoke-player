import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView — provide a no-op stub
window.HTMLElement.prototype.scrollIntoView = function () {};
