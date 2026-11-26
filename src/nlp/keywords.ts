import type { CompiledDictionary, KeywordDecision } from "../shared/types";
import { normalizeText } from "./normalize";

export function compileDictionary(list: readonly string[]): CompiledDictionary {
  const single = new Set<string>();
  const phraseSet = new Set<string>();

  for (const raw of list) {
    const normalized = normalizeText(raw);
    if (!normalized) continue;
    if (normalized.includes(" ")) {
      phraseSet.add(normalized);
    } else {
      single.add(normalized);
    }
  }

  return { single, phrases: Array.from(phraseSet) };
}

/**
 * Matches whole words via O(1) Set lookup and multi-word phrases on strict word boundaries
 * (space-padded), preventing substring collisions like "هلا" matching "لا" or "شغال" matching "غا".
 */
export function matchesCompiledDict(
  normChunk: string,
  wordsArray: readonly string[],
  dict: CompiledDictionary
): boolean {
  if (dict.phrases.length > 0) {
    const padded = ` ${normChunk} `;
    for (const phrase of dict.phrases) {
      if (padded.includes(` ${phrase} `)) {
        return true;
      }
    }
  }

  for (const word of wordsArray) {
    if (dict.single.has(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves a speech transcript chunk against Absent and Present dictionaries.
 * Absent is evaluated before Present so negated phrases like "مش موجود" / "not here"
 * take priority over their positive single-word counterparts ("موجود" / "here").
 */
export function matchAttendanceKeyword(
  rawChunk: string,
  presentDict: CompiledDictionary,
  absentDict: CompiledDictionary
): KeywordDecision {
  const norm = normalizeText(rawChunk);
  if (!norm) return null;
  const words = norm.split(" ");

  if (matchesCompiledDict(norm, words, absentDict)) {
    return "absent";
  }
  if (matchesCompiledDict(norm, words, presentDict)) {
    return "present";
  }
  return null;
}
