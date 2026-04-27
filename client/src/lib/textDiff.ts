export interface DiffSegment {
  type: "equal" | "added" | "removed";
  text: string;
}

export interface LineDiff {
  type: "equal" | "modified" | "added" | "removed";
  oldLine?: string;
  newLine?: string;
  text?: string;
}

export function computeWordDiff(original: string, modified: string): DiffSegment[] {
  if (original === modified) return [{ type: "equal", text: modified }];
  if (!original) return [{ type: "added", text: modified }];
  if (!modified) return [{ type: "removed", text: original }];

  const originalWords = tokenize(original);
  const modifiedWords = tokenize(modified);

  const lcs = longestCommonSubsequence(originalWords, modifiedWords);

  const segments: DiffSegment[] = [];
  let oi = 0;
  let mi = 0;

  for (const [lo, lm] of lcs) {
    if (oi < lo || mi < lm) {
      if (oi < lo) {
        segments.push({ type: "removed", text: originalWords.slice(oi, lo).join("") });
      }
      if (mi < lm) {
        segments.push({ type: "added", text: modifiedWords.slice(mi, lm).join("") });
      }
    }
    segments.push({ type: "equal", text: originalWords[lo] });
    oi = lo + 1;
    mi = lm + 1;
  }

  if (oi < originalWords.length) {
    segments.push({ type: "removed", text: originalWords.slice(oi).join("") });
  }
  if (mi < modifiedWords.length) {
    segments.push({ type: "added", text: modifiedWords.slice(mi).join("") });
  }

  return mergeSegments(segments);
}

export function computeLineDiff(original: string, modified: string): LineDiff[] {
  if (original === modified) return [{ type: "equal", text: modified }];
  if (!original) return [{ type: "added", newLine: modified }];
  if (!modified) return [{ type: "removed", oldLine: original }];

  const origLines = original.split(/\n/);
  const modLines = modified.split(/\n/);

  const lcs = longestCommonSubsequence(origLines, modLines);
  const result: LineDiff[] = [];
  let oi = 0;
  let mi = 0;

  for (const [lo, lm] of lcs) {
    const removedLines = origLines.slice(oi, lo);
    const addedLines = modLines.slice(mi, lm);

    const pairCount = Math.min(removedLines.length, addedLines.length);
    for (let p = 0; p < pairCount; p++) {
      result.push({ type: "modified", oldLine: removedLines[p], newLine: addedLines[p] });
    }
    for (let p = pairCount; p < removedLines.length; p++) {
      result.push({ type: "removed", oldLine: removedLines[p] });
    }
    for (let p = pairCount; p < addedLines.length; p++) {
      result.push({ type: "added", newLine: addedLines[p] });
    }

    result.push({ type: "equal", text: origLines[lo] });
    oi = lo + 1;
    mi = lm + 1;
  }

  const removedTail = origLines.slice(oi);
  const addedTail = modLines.slice(mi);
  const pairCount = Math.min(removedTail.length, addedTail.length);
  for (let p = 0; p < pairCount; p++) {
    result.push({ type: "modified", oldLine: removedTail[p], newLine: addedTail[p] });
  }
  for (let p = pairCount; p < removedTail.length; p++) {
    result.push({ type: "removed", oldLine: removedTail[p] });
  }
  for (let p = pairCount; p < addedTail.length; p++) {
    result.push({ type: "added", newLine: addedTail[p] });
  }

  return result;
}

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) || [];
}

function longestCommonSubsequence(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;

  if (m * n > 500000) {
    return greedyLCS(a, b);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push([i, j]);
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

function greedyLCS(a: string[], b: string[]): [number, number][] {
  const bMap = new Map<string, number[]>();
  for (let j = 0; j < b.length; j++) {
    if (!bMap.has(b[j])) bMap.set(b[j], []);
    bMap.get(b[j])!.push(j);
  }

  const result: [number, number][] = [];
  let lastJ = -1;
  for (let i = 0; i < a.length; i++) {
    const positions = bMap.get(a[i]);
    if (!positions) continue;
    const pos = positions.find(j => j > lastJ);
    if (pos !== undefined) {
      result.push([i, pos]);
      lastJ = pos;
    }
  }
  return result;
}

function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const seg of segments) {
    if (seg.text === "") continue;
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export function hasChanges(original: string | null | undefined, modified: string | null | undefined): boolean {
  return (original ?? "") !== (modified ?? "");
}
