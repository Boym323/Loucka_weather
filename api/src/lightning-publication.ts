/** Read-only publication safety for legacy lightning counters (audit #17).
 *
 * The original WeeWX archive has timestamp-like values in the disturber
 * counter and noise often aliases strike count. Do not silently re-label,
 * convert or certify these values until the actual device driver mapping is
 * proven with an authentic raw payload. The raw database remains unchanged.
 */
import type {Metric} from './metrics.js';

const unverifiedCounters:ReadonlySet<Metric>=new Set([
 'lightning_disturber_count','lightning_noise_count'
]);

export const LIGHTNING_QC_FLAG='UNVERIFIED_FIELD_MAPPING' as const;
export function hasUnverifiedLightningMapping(metric:Metric):boolean{
 return unverifiedCounters.has(metric);
}
export const LIGHTNING_QC_EXPLANATION=
 'Original lightning noise/disturber columns have unverified source mapping; raw observations are preserved and public numeric values are withheld.';
