export const COLORS = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  darkBg: '#991B1B',
  darkCard: '#FFFFFF',
  darkBorder: '#FEE2E2',
  text: '#0F172A',
  textMuted: '#64748B',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  primary: '#E51922',
  primaryDark: '#B91C1C',
  primarySoft: '#FEF2F2',
  success: '#10B981',
  successDark: '#059669',
  successSoft: '#ECFDF5',
  accent: '#E51922',
  accentSoft: '#FEE2E2',
  indigo: '#1E293B',
  indigoSoft: '#F1F5F9',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
};

export const GRADIENTS = {
  brand: ['#E51922', '#B91C1C'] as const,
  hero: ['#991B1B', '#C8102E', '#E51922'] as const,
  wallet: ['#B91C1C', '#DC141C', '#E51922'] as const,
  offer: ['#991B1B', '#DC141C'] as const,
  success: ['#059669', '#10B981'] as const,
};

export const SHADOW = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  dock: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
};
