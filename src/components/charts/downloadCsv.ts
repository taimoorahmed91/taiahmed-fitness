// The browser half of the CSV export: hand the text to the browser as a file. Kept apart from src/lib/chartCsv.ts
// (pure) so the formatting rules stay testable without a DOM.
export const downloadTextFile = (filename: string, text: string, mime = 'text/csv;charset=utf-8'): void => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // The click has queued the download; release the blob after the browser has taken it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
