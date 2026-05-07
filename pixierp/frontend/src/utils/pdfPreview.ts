/** Returns true if the given URL or filename points to a PDF file */
export function isPdf(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url || '');
}

/** Opens a PDF URL in the print-preview page in a new tab */
export function openPdfPreview(url: string): void {
  window.open(`/print-preview?pdfUrl=${encodeURIComponent(url)}`, '_blank');
}

/**
 * For use in onClick handlers on <a> tags:
 * intercepts PDF links and opens them in print-preview instead.
 */
export function handlePdfLinkClick(
  e: React.MouseEvent,
  url: string
): void {
  if (isPdf(url)) {
    e.preventDefault();
    openPdfPreview(url);
  }
}
