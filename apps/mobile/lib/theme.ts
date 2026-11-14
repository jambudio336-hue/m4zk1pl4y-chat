export const colors = {
  bg: '#0B141A',
  panel: '#111B21',
  panelAlt: '#202C33',
  line: '#2A3942',
  lineDim: '#26343B',
  text: '#E9EDEF',
  textDim: '#8696A0',
  accent: '#00A884',
  danger: '#F15C6D',
  ok: '#25D366',
};

export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 30 };

export const radius = { sm: 10, md: 16 };

export const border = {
  thick: { borderWidth: 1, borderColor: colors.line },
  thin: { borderWidth: 1, borderColor: colors.lineDim },
};

export const type = {
  mono: 'monospace',
  display: { fontFamily: 'System', fontWeight: '800' as const, letterSpacing: -0.6 },
  label: {
    fontFamily: 'System',
    fontWeight: '700' as const,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
};

export const ACCENTS = ['#00A884', '#25D366', '#53BDEB', '#7C83FD', '#D98BEA', '#F5A623'];

export function pickAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return ACCENTS[h % ACCENTS.length];
}
