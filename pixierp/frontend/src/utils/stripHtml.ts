/**
 * Strips HTML tags and decodes common HTML entities from a string.
 * Uses the DOM when available for accurate parsing, falls back to regex.
 * Preserves newlines from block-level elements (<br>, </p>, </div>, </li>).
 */
const stripHtml = (s: any): string => {
  if (s == null) return '';
  const str = String(s);
  if (str.indexOf('<') === -1 && str.indexOf('&') === -1) return str;
  // Convert block-level closings and <br> to newlines before parsing
  const withBreaks = str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  if (typeof document !== 'undefined') {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = withBreaks;
      const text = tmp.textContent || tmp.innerText || '';
      return text
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch { /* fall through */ }
  }
  return withBreaks
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export default stripHtml;
