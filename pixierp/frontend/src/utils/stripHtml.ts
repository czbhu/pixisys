/**
 * Strips HTML tags and decodes common HTML entities from a string.
 * Uses the DOM when available for accurate parsing, falls back to regex.
 */
const stripHtml = (s: any): string => {
  if (s == null) return '';
  const str = String(s);
  if (str.indexOf('<') === -1 && str.indexOf('&') === -1) return str;
  if (typeof document !== 'undefined') {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = str;
      return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    } catch { /* fall through */ }
  }
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

export default stripHtml;
