// SLF_FAMILY_KEY_v1 - SLF request ids are scoped to their product family.
export const KEY_BASE = 1_000_000_000_000;
export const FAMILY_CODE: Record<string, number> = {
  credit: 1,
  "equipment-financing": 2,
  invoice: 3,
  "factoring-bid": 4,
};

export function requestKey(family: string, slfId: number): number {
  const code = FAMILY_CODE[family];
  if (!code) throw new Error(`Unknown SLF product family: ${family}`);
  if (!Number.isInteger(slfId) || slfId < 0 || slfId >= KEY_BASE)
    throw new Error(`SLF id out of range: ${slfId}`);
  return code * KEY_BASE + slfId;
}

export function dealIdToKey(param: string): number | null {
  const match = /^([a-z-]+)-(\d+)$/.exec(param);
  if (match) {
    try {
      return requestKey(match[1], Number(match[2]));
    } catch {
      return null;
    }
  }
  return /^\d+$/.test(param) ? Number(param) : null;
}
