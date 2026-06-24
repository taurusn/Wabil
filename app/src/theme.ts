// Nocturnal design tokens — single source of truth.
// Mirrors the approved prototype + UI Build Spec exactly.

export const color = {
  bgBase: '#0B0D13',
  bgGlowFrom: '#1A2536',
  bgGlowTo: '#0B0D13',
  page: '#07080C',

  textBright: '#EEF2FA', // hero serif, titles
  textPrimary: '#DDE4F1', // assistant statements
  textSecondary: '#8492AC', // prose, subtitles
  textDim: '#6B7488', // de-emphasized clauses
  textMuted: '#5D6A85', // labels, captions

  accentGlow: '#6BA8FF', // glyphs, send, links
  accentHi: '#AEE0FF', // orb highlight
  accentCoreA: '#4F8FE0', // orb mid
  accentCoreB: '#2A4D8F', // orb edge

  btnGradA: '#3F7FDC',
  btnGradB: '#2C5FB0',

  hairline: 'rgba(140,170,220,0.16)',
  surfaceSoft: 'rgba(120,150,200,0.05)',
  bubbleMe: 'rgba(120,150,200,0.12)',
  bubbleMeEdge: 'rgba(140,170,220,0.18)',

  success: '#5FD29A',
  glowBlue: 'rgba(96,165,250,1)', // use with opacity on shadow
  white: '#FFFFFF',
  userText: '#D4DDEE',
} as const;

export const font = {
  serif: 'Fraunces_400Regular',
  serifMed: 'Fraunces_500Medium',
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const radius = {
  bubble: 16,
  card: 15,
  button: 16,
  pill: 12,
  field: 22,
} as const;

export const space = {
  screenX: 24,
  gapChat: 19,
} as const;
