export const colors = {
  // Cyber-dark surfaces with familiar messenger contrast and WhatsApp-like green actions.
  bg: '#070A0F',
  panel: '#0D131B',
  panelAlt: '#141E28',
  line: '#243341',
  lineDim: '#1B2935',
  text: '#EAF2F5',
  textDim: '#91A2AD',
  accent: '#00E5B0',
  danger: '#FF5268',
  ok: '#36E58C',
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

export const ACCENTS = ['#00E5B0', '#36E58C', '#53BDEB', '#8B8FFF', '#D98BEA', '#FFB84D'];

export function pickAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return ACCENTS[h % ACCENTS.length];
}
