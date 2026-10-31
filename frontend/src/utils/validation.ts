import { Principal } from '@dfinity/principal';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates Internet Computer Principal text.
 */
export function validatePrincipalText(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: 'Principal ID cannot be empty.' };
  }
  try {
    Principal.fromText(trimmed);
    return { valid: true };
  } catch {
    return { valid: false, error: `Invalid Principal ID format: "${trimmed.slice(0, 32)}".` };
  }
}

/**
 * Validates a list of newline-separated Principal strings.
 */
export function validatePrincipalList(input: string): { valid: boolean; principals: Principal[]; error?: string } {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { valid: false, principals: [], error: 'Please provide at least one voter Principal ID.' };
  }
  const principals: Principal[] = [];
  for (let i = 0; i < lines.length; i++) {
    const res = validatePrincipalText(lines[i]);
    if (!res.valid) {
      return { valid: false, principals: [], error: `Line ${i + 1}: ${res.error}` };
    }
    principals.push(Principal.fromText(lines[i]));
  }
  return { valid: true, principals };
}

/**
 * Validates a hexadecimal string (charset and byte length bounds).
 * Expects optional 0x prefix followed by an even number of hex chars.
 */
export function validateHexString(
  input: string,
  fieldName: string,
  minBytes: number = 1,
  maxBytes: number = 128
): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: `${fieldName} is required.` };
  }
  const raw = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  if (raw.length === 0) {
    return { valid: false, error: `${fieldName} must contain hexadecimal characters.` };
  }
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    return { valid: false, error: `${fieldName} contains non-hexadecimal characters.` };
  }
  if (raw.length % 2 !== 0) {
    return { valid: false, error: `${fieldName} must have an even number of hex characters.` };
  }
  const byteLen = raw.length / 2;
  if (byteLen < minBytes || byteLen > maxBytes) {
    return {
      valid: false,
      error: `${fieldName} must be between ${minBytes} and ${maxBytes} bytes (${minBytes * 2}–${maxBytes * 2} hex chars).`,
    };
  }
  return { valid: true };
}

/**
 * Validates an Election ID or Title.
 */
export function validateElectionTitle(title: string): ValidationResult {
  const trimmed = title.trim();
  if (!trimmed) {
    return { valid: false, error: 'Election title is required.' };
  }
  if (trimmed.length < 3 || trimmed.length > 120) {
    return { valid: false, error: 'Election title must be between 3 and 120 characters.' };
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: 'Election title contains invalid control characters.' };
  }
  return { valid: true };
}

export function validateElectionId(electionId: string): ValidationResult {
  const trimmed = electionId.trim();
  if (!trimmed) {
    return { valid: false, error: 'Election ID is required.' };
  }
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(trimmed)) {
    return { valid: false, error: 'Election ID must be 3–64 alphanumeric, underscore, or hyphen characters.' };
  }
  return { valid: true };
}

/**
 * Validates start and end timestamps.
 */
export function validateTimestamps(startTime: bigint, endTime: bigint): ValidationResult {
  if (startTime < 0n || endTime < 0n) {
    return { valid: false, error: 'Timestamps must be non-negative.' };
  }
  if (endTime > 0n && endTime <= startTime) {
    return { valid: false, error: 'End time must be strictly greater than start time.' };
  }
  return { valid: true };
}

/**
 * Validates Shamir threshold (n of m) bounds.
 */
export function validateThresholdBounds(threshold: number, totalShares: number): ValidationResult {
  if (!Number.isInteger(threshold) || !Number.isInteger(totalShares)) {
    return { valid: false, error: 'Threshold (n) and Total Shares (m) must be whole integers.' };
  }
  if (threshold < 2 || threshold > 10) {
    return { valid: false, error: 'Threshold (n) must be between 2 and 10.' };
  }
  if (totalShares < 2 || totalShares > 20) {
    return { valid: false, error: 'Total Shares (m) must be between 2 and 20.' };
  }
  if (threshold > totalShares) {
    return { valid: false, error: 'Threshold (n) cannot exceed Total Shares (m).' };
  }
  return { valid: true };
}

/**
 * Validates and parses newline-separated trustee shares ("index:0x..." or "index,0x...").
 */
export function validateAndParseTrusteeShares(
  input: string,
  minShares: number = 2
): { valid: boolean; shares: Array<{ index: number; share_hex: string }>; error?: string } {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < minShares) {
    return {
      valid: false,
      shares: [],
      error: `Please provide at least ${minShares} trustee shares (one per line).`,
    };
  }
  const seenIndices = new Set<number>();
  const shares: Array<{ index: number; share_hex: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.includes(':') ? ':' : line.includes(',') ? ',' : null;
    if (!sep) {
      return {
        valid: false,
        shares: [],
        error: `Share line ${i + 1}: Invalid format. Expected "index:0x_share_hex".`,
      };
    }
    const [idxStr, ...rest] = line.split(sep);
    const shareHex = rest.join(sep).trim();
    const index = Number(idxStr.trim());
    if (!Number.isInteger(index) || index < 1 || index > 20) {
      return {
        valid: false,
        shares: [],
        error: `Share line ${i + 1}: Share index must be an integer between 1 and 20.`,
      };
    }
    if (seenIndices.has(index)) {
      return {
        valid: false,
        shares: [],
        error: `Share line ${i + 1}: Duplicate share index #${index}.`,
      };
    }
    const hexCheck = validateHexString(shareHex, `Share #${index} hex`, 1, 64);
    if (!hexCheck.valid) {
      return { valid: false, shares: [], error: `Share line ${i + 1}: ${hexCheck.error}` };
    }
    seenIndices.add(index);
    shares.push({ index, share_hex: shareHex });
  }

  return { valid: true, shares };
}

/**
 * Validates BSGS tally max bound.
 */
export function validateTallyBound(maxBound: number): ValidationResult {
  if (!Number.isInteger(maxBound) || maxBound < 1 || maxBound > 1_000_000) {
    return { valid: false, error: 'Tally maximum bound must be an integer between 1 and 1,000,000.' };
  }
  return { valid: true };
}
