/** Load average counts tasks; a percentage requires a known positive core count. */
export function loadCapacityPercent(load: number | null, cores: number | null): number | null {
  if (load === null || cores === null || !Number.isFinite(load) || !Number.isFinite(cores)
    || load < 0 || cores <= 0) return null
  return load / cores * 100
}
