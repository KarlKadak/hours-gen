export const parseCSV = (csv: string) => {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine
    .replace(/^"|"$/g, "")
    .split(/","/g)
    .map((h) => h.trim());
  return lines.map((line) => {
    const cols = line.replace(/^"|"$/g, "").split(/","/g);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    return obj;
  });
};