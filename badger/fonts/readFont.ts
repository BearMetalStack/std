export function parseTTF(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer);
  const tables: Record<string, { offset: number; length: number }> = {};

  // 1. Read table directory
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const base = 12 + i * 16;
    const tag = String.fromCharCode(
      bytes[base],
      bytes[base + 1],
      bytes[base + 2],
      bytes[base + 3],
    );
    tables[tag] = {
      offset: view.getUint32(base + 8),
      length: view.getUint32(base + 12),
    };
  }

  // 2. Parse head → unitsPerEm
  const unitsPerEm = view.getUint16(tables.head.offset + 18);

  // 3. Parse hhea → numberOfHMetrics
  const numberOfHMetrics = view.getUint16(tables.hhea.offset + 34);

  // 4. Parse cmap → build codepoint→glyphId map
  const codepointToGlyphId = new Map<number, number>();
  const cmapBase = tables.cmap.offset;
  const numSubtables = view.getUint16(cmapBase + 2);

  let chosenOffset: number | null = null;
  let chosenFormat: number | null = null;

  // Find the best subtable: prefer format 12 (full unicode) over format 4 (BMP)
  for (let i = 0; i < numSubtables; i++) {
    const entry = cmapBase + 4 + i * 8;
    const platformID = view.getUint16(entry);
    const encodingID = view.getUint16(entry + 2);
    const subtableOffset = cmapBase + view.getUint32(entry + 4);
    const format = view.getUint16(subtableOffset);

    const isUnicode = platformID === 0 ||
      (platformID === 3 && (encodingID === 1 || encodingID === 10));

    if (!isUnicode) continue;

    if (format === 12) {
      chosenOffset = subtableOffset;
      chosenFormat = 12;
      break; // format 12 is best, stop looking
    }
    if (format === 4 && chosenFormat !== 12) {
      chosenOffset = subtableOffset;
      chosenFormat = 4;
    }
  }

  if (chosenOffset === null) {
    throw new Error("No supported cmap subtable found");
  }

  if (chosenFormat === 4) {
    // Format 4: segmented mapping
    const segCount = view.getUint16(chosenOffset + 6) / 2;
    const endCodesBase = chosenOffset + 14;
    const startCodesBase = endCodesBase + segCount * 2 + 2; // +2 for reservedPad
    const idDeltaBase = startCodesBase + segCount * 2;
    const idRangeOffsetBase = idDeltaBase + segCount * 2;
    const glyphIdArrayBase = idRangeOffsetBase + segCount * 2;

    for (let i = 0; i < segCount; i++) {
      const endCode = view.getUint16(endCodesBase + i * 2);
      const startCode = view.getUint16(startCodesBase + i * 2);
      const idDelta = view.getInt16(idDeltaBase + i * 2);
      const idRangeOffset = view.getUint16(idRangeOffsetBase + i * 2);

      if (startCode === 0xFFFF) break; // last segment sentinel

      for (let cp = startCode; cp <= endCode; cp++) {
        let glyphId: number;
        if (idRangeOffset === 0) {
          glyphId = (cp + idDelta) & 0xFFFF;
        } else {
          // The pointer arithmetic: idRangeOffset is relative to the
          // idRangeOffset field's own position in the file
          const idRangeOffsetAddr = idRangeOffsetBase + i * 2;
          const glyphIdAddr = idRangeOffsetAddr + idRangeOffset +
            (cp - startCode) * 2;
          glyphId = view.getUint16(glyphIdAddr);
          if (glyphId !== 0) glyphId = (glyphId + idDelta) & 0xFFFF;
        }
        if (glyphId !== 0) codepointToGlyphId.set(cp, glyphId);
      }
    }
  } else if (chosenFormat === 12) {
    // Format 12: flat group list, much simpler
    const numGroups = view.getUint32(chosenOffset + 12);
    for (let i = 0; i < numGroups; i++) {
      const groupBase = chosenOffset + 16 + i * 12;
      const startCode = view.getUint32(groupBase);
      const endCode = view.getUint32(groupBase + 4);
      const startGlyphId = view.getUint32(groupBase + 8);
      for (let cp = startCode; cp <= endCode; cp++) {
        codepointToGlyphId.set(cp, startGlyphId + (cp - startCode));
      }
    }
  }

  // 5. Parse hmtx → build glyphId→advanceWidth map
  const glyphIdToAdvanceWidth = new Map<number, number>();
  const hmtxBase = tables.hmtx.offset;
  for (let i = 0; i < numberOfHMetrics; i++) {
    glyphIdToAdvanceWidth.set(i, view.getUint16(hmtxBase + i * 4));
  }
  // Glyphs beyond numberOfHMetrics share the last advance width
  const lastAdvanceWidth = glyphIdToAdvanceWidth.get(numberOfHMetrics - 1) ?? 0;
  const totalGlyphs = tables.hmtx.length / 4;
  for (let i = numberOfHMetrics; i < totalGlyphs; i++) {
    glyphIdToAdvanceWidth.set(i, lastAdvanceWidth);
  }

  // 6. Return (codepoint, fontSize) => pixelWidth
  return (codepoint: number): number => {
    const glyphId = codepointToGlyphId.get(codepoint);
    if (glyphId === undefined) return 0;
    const advanceWidth = glyphIdToAdvanceWidth.get(glyphId) ?? lastAdvanceWidth;
    return (advanceWidth / unitsPerEm);
  };
}
