export function extractOutline(markdown) {
  return String(markdown)
    .split(/\r?\n/)
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line);
      if (!match) {
        return null;
      }

      return {
        level: match[1].length,
        title: match[2].trim(),
        line: index + 1
      };
    })
    .filter(Boolean);
}

