export const colors = {
  bg: '#0A0A0A',
  panel: '#151515',
  panelAlt: '#1E1E1E',
  line: '#F2F2F2',
  lineDim: '#3A3A3A',
  text: '#F5F5F5',
  textDim: '#8A8A8A',
  accent: '#FFE600',
  danger: '#FF3D00',
  ok: '#00E676',
};

export const space = { xs: 4, sm: 8, md: 14, lg: 22, xl: 34 };

export const radius = { sm: 4, md: 8 };

export const border = {
  thick: { borderWidth: 3, borderColor: colors.line },
  thin: { borderWidth: 2, borderColor: colors.lineDim },
};

export const type = {
  mono: 'monospace',
  display: { fontFamily: 'monospace', fontWeight: '900' as const, letterSpacing: -0.5 },
  label: {
    fontFamily: 'monospace',
    fontWeight: '700' as const,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
};

export const ACCENTS = ['#FFE600', '#FF3D00', '#00E676', '#00D8FF', '#C77DFF', '#FF7AB6'];

export function pickAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return ACCENTS[h % ACCENTS.length];
}
