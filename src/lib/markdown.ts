// Strip markdown syntax from a single line and return plain text.
function stripLine(line: string): string {
  // Skip code block fences
  if (/^(`{3,}|~{3,})/.test(line)) return '';
  // Headings, blockquotes, list markers
  line = line.replace(/^#{1,6}\s+/, '');
  line = line.replace(/^>\s*/, '');
  line = line.replace(/^[-*+]\s+/, '');
  line = line.replace(/^\d+[.)]\s+/, '');
  // Images before links (order matters)
  line = line.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links
  line = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Inline code, bold, italic, strikethrough
  line = line.replace(/`([^`]*)`/g, '$1');
  line = line.replace(/\*\*([^*]*)\*\*/g, '$1');
  line = line.replace(/\*([^*]*)\*/g, '$1');
  line = line.replace(/~~([^~]*)~~/g, '$1');
  return line.trim();
}

/**
 * Extract a short plain-text label from the first few non-empty lines
 * of a markdown document. Result is at most 256 UTF-8 bytes.
 */
export function getShortLabel(markdown: string): string {
  const parts: string[] = [];
  for (const raw of markdown.split('\n')) {
    const text = stripLine(raw.trim());
    if (text) parts.push(text);
    if (parts.length >= 3) break;
  }
  const joined = parts.join(' ');
  // Truncate to 256 UTF-8 bytes, respecting character boundaries
  const encoded = new TextEncoder().encode(joined);
  if (encoded.length <= 256) return joined;
  // Walk backwards to find a safe cut point (avoids splitting multi-byte chars)
  let end = 256;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(encoded.slice(0, end));
}
