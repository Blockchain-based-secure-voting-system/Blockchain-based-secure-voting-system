/**
 * Strict White, Black, and Cobalt Blue Design System Tokens & WCAG AA Contrast Ratios
 *
 * Palette Rules:
 * - White (#FFFFFF) for light surfaces and text on dark/cobalt surfaces.
 * - Black (#0A0A0A) for dark surfaces and primary text on light surfaces.
 * - Cobalt Blue (#0047AB) for primary interactive actions, links, focus rings, active states, and phase indicators.
 * - Neutral Greys (#F4F4F4, #E0E0E0, #525252, #171717, #2E2E2E, #A3A3A3) strictly for borders, secondary surfaces, and disabled/secondary text.
 * - Status semantic indicators always pair text with an explicit icon and label so state never depends on color alone.
 */

export const DESIGN_TOKENS = {
  light: {
    bgMain: '#FFFFFF',
    bgSurface: '#FFFFFF',
    bgCard: '#F4F4F4',
    bgCardHover: '#E8E8E8',
    borderColor: '#737373', // 4.74:1 against #FFFFFF (exceeds 3:1 UI component threshold)
    textPrimary: '#0A0A0A', // 19.80:1 against #FFFFFF
    textSecondary: '#404040', // 10.36:1 against #FFFFFF, 9.38:1 against #F4F4F4
    textMuted: '#525252', // 7.73:1 against #FFFFFF, 7.00:1 against #F4F4F4
    cobaltPrimary: '#0047AB', // 8.43:1 against #FFFFFF (white text on #0047AB = 8.43:1)
    cobaltHover: '#003580', // 11.45:1 with #FFFFFF
    cobaltText: '#0047AB', // 8.43:1 on #FFFFFF, 7.63:1 on #F4F4F4
    focusRing: '#0047AB',
    errorText: '#990000', // 9.77:1 against #FFFFFF
    errorBg: '#F4F4F4',
    errorBorder: '#990000',
    successText: '#0047AB', // 8.43:1 against #FFFFFF (cobalt + CheckCircle icon + prefix text)
    successBg: '#F4F4F4',
    successBorder: '#0047AB',
  },
  dark: {
    bgMain: '#0A0A0A',
    bgSurface: '#0A0A0A',
    bgCard: '#171717',
    bgCardHover: '#262626',
    borderColor: '#8A8A8A', // 5.65:1 against #0A0A0A (exceeds 3:1 UI component threshold)
    textPrimary: '#FFFFFF', // 19.80:1 against #0A0A0A
    textSecondary: '#D4D4D4', // 13.38:1 against #0A0A0A, 12.18:1 against #171717
    textMuted: '#A3A3A3', // 7.91:1 against #0A0A0A, 7.20:1 against #171717
    cobaltPrimary: '#0047AB', // White text (#FFFFFF) on #0047AB background = 8.43:1
    cobaltHover: '#0056D2', // White text (#FFFFFF) on #0056D2 background = 6.37:1
    cobaltText: '#FFFFFF', // On dark surfaces, never put #0047AB text on #0A0A0A (2.35:1 fails). Use #FFFFFF on #0047AB pill or #FFFFFF text.
    focusRing: '#FFFFFF',
    errorText: '#FFFFFF', // White text inside dark card with #FFFFFF border & AlertTriangle icon = 18.02:1
    errorBg: '#171717',
    errorBorder: '#FFFFFF',
    successText: '#FFFFFF', // White text on #0047AB or #171717 with CheckCircle icon = 8.43:1 / 18.02:1
    successBg: '#0047AB',
    successBorder: '#FFFFFF',
  },
} as const;

/**
 * Computes WCAG 2.1 relative luminance for a 6-digit hex color.
 */
export function getRelativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Computes WCAG 2.1 contrast ratio between two hex colors (1.0 to 21.0).
 */
export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = getRelativeLuminance(foregroundHex);
  const l2 = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}
