export function formatCount(count: number | string | undefined | null): string {
  if (count === undefined || count === null) return "";

  let num: number;
  if (typeof count === "number") {
    num = count;
  } else {
    const cleanStr = count.replace(/,/g, "").trim();
    
    const shortMatch = cleanStr.match(/^([\d\.]+)\s*([kKmMbBtT])/);
    if (shortMatch && shortMatch[1] && shortMatch[2]) {
      return `${shortMatch[1]}${shortMatch[2].toUpperCase()}`;
    }

    const match = cleanStr.match(/^[\d\.]+/);
    if (!match || !match[0]) return count; 
    num = parseFloat(match[0]);
    if (isNaN(num)) return count;

    const remaining = cleanStr.slice(match[0].length).toLowerCase().trim();
    if (remaining.length > 0) {
      const firstChar = remaining.charAt(0);
      if (firstChar === "k" || firstChar === "m" || firstChar === "b" || firstChar === "t") {
        return `${match[0]}${firstChar.toUpperCase()}`;
      }
    }
  }

  if (num >= 1e9) {
    const formatted = (num / 1e9).toFixed(1);
    return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "B";
  }
  if (num >= 1e6) {
    const formatted = (num / 1e6).toFixed(1);
    return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "M";
  }
  if (num >= 1e3) {
    const formatted = (num / 1e3).toFixed(1);
    return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "K";
  }

  return num.toString();
}
