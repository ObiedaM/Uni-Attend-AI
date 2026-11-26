const ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PUNCTUATION_REGEX = /[.,!?؟،؛:"'«»()[\]{}\-_/\\|•]/g;

/**
 * Normalizes Arabic & English speech/keyword strings:
 * - Lowercases Latin characters
 * - Strips Arabic diacritics (Tashkeel) and Tatweel (kashida)
 * - Unifies Alef variants (أ/إ/آ/ٱ -> ا) and Ta Marbuta (ة -> ه)
 * - Replaces punctuation with spaces and collapses whitespace
 */
export function normalizeText(str: string | null | undefined): string {
  return String(str ?? "")
    .toLowerCase()
    .replace(ARABIC_DIACRITICS_REGEX, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(PUNCTUATION_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}
