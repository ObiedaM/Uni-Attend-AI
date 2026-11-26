const COMPOUND_PREFIXES = new Set([
  "عبد",
  "ابو",
  "أبو",
  "ابي",
  "أبي",
  "ابن",
  "إبن",
  "بن",
  "ام",
  "أم",
  "آل",
  "ذو"
]);

const COMPOUND_SUFFIXES = new Set([
  "الله",
  "الدين",
  "الاسلام",
  "الإسلام",
  "الحق",
  "الهدى",
  "النور",
  "الرحمن",
  "الرحيم",
  "الكريم",
  "العزيز",
  "المجيد",
  "الحميد",
  "الوهاب",
  "الفتاح",
  "الرزاق"
]);

const ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Splits a cleaned name into logical parts, keeping compound Arabic given/father names
 * intact (e.g., "عبد الرحمن", "صلاح الدين", "أبو بكر", "نور الهدى").
 */
export function splitIntoLogicalNameParts(cleanName: string): string[] {
  const rawWords = cleanName.split(/\s+/).filter(Boolean);
  const parts: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    let current = rawWords[i];
    const bareCurrent = current.replace(ARABIC_DIACRITICS_REGEX, "");

    if (COMPOUND_PREFIXES.has(bareCurrent) && i + 1 < rawWords.length) {
      current += ` ${rawWords[i + 1]}`;
      i++;
    } else if (i + 1 < rawWords.length) {
      const bareNext = rawWords[i + 1].replace(ARABIC_DIACRITICS_REGEX, "");
      if (COMPOUND_SUFFIXES.has(bareNext)) {
        current += ` ${rawWords[i + 1]}`;
        i++;
      }
    }

    parts.push(current);
  }

  return parts;
}

export function cleanNameForSpeech(rawText: string): string {
  return String(rawText || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[0-9٠-٩]+/g, " ")
    .replace(/[.,/_:;•\-|#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpeechNames(
  rawText: string,
  fallbackDisplayName: string
): { fullSpeechName: string; shortSpeechName: string } {
  const cleaned = cleanNameForSpeech(rawText);
  const fullSpeechName = cleaned.length > 1 ? cleaned : fallbackDisplayName;
  const parts = splitIntoLogicalNameParts(fullSpeechName);
  const shortSpeechName = parts.slice(0, 2).join(" ") || fullSpeechName;
  return { fullSpeechName, shortSpeechName };
}

/**
 * Extracts a student ID (if present) from row text, preferring parenthesized/bracketed
 * numeric IDs like "(2024003)" or standalone 5+ digit tokens while ignoring short row indices.
 */
export function extractStudentId(rawText: string): string {
  const text = String(rawText || "");
  const parenMatch = text.match(/[([]([0-9٠-٩]{4,14})[)\]]/);
  if (parenMatch) {
    return toWesternDigits(parenMatch[1]);
  }
  const tokenMatch = text.match(/(?:^|[\s\-|/,:#])([0-9٠-٩]{5,14})(?=$|[\s\-|/,:#])/);
  if (tokenMatch) {
    return toWesternDigits(tokenMatch[1]);
  }
  return "";
}

function toWesternDigits(digits: string): string {
  return digits.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
