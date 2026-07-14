// SLF_FULL_MODEL_v1 - backoff is PER FAMILY. It used to be one global object, so a single failing family suspended all four.
type FamilyState = { consecutiveFailures: number; suspendedUntil: number | null; lastError: string | null; lastSuccessfulSync: number | null };
const states = new Map<string, FamilyState>();
export function stateFor(family: string): FamilyState { let s = states.get(family); if (!s) { s = { consecutiveFailures: 0, suspendedUntil: null, lastError: null, lastSuccessfulSync: null }; states.set(family, s); } return s; }
export function allStates(): Record<string, FamilyState> { return Object.fromEntries(states.entries()); }
