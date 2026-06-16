/** Pension group, fixed by plan-join date (with a re-employment override edge case). */
export type Group = 1 | 2;

/** Province of residence. Tax tables are province-keyed; Ontario is the v1 default. */
export type Province = 'ON' | 'QC' | 'BC' | 'AB' | 'MB' | 'SK' | 'NB' | 'NS' | 'PE' | 'NL' | 'YT' | 'NT' | 'NU';
