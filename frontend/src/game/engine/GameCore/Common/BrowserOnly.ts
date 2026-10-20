// What only the browser game needs, such as loading large frames ahead: it runs here, and the C++ export leaves it out
// (export/translator drops BrowserOnly(...) statements).

export function BrowserOnly(run: () => void) {
  run();
}
