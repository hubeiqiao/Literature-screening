const USAGE_MODES = ['byok', 'managed'] as const;

type UsageMode = (typeof USAGE_MODES)[number];

export { USAGE_MODES };
export type { UsageMode };
