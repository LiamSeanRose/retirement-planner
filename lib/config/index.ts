export * from './2026';
import { CONFIG_2026, type YearConfig } from './2026';

/** The active default config. Swap or extend by year as constants are re-verified annually. */
export const DEFAULT_CONFIG: YearConfig = CONFIG_2026;
