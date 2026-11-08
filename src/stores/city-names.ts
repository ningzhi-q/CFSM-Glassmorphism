import { shallowRef } from 'vue'
import type { CityGazetteerRecord } from '@/types/city-names'

export const cityNames = shallowRef<ReadonlyMap<string, readonly CityGazetteerRecord[]>>(new Map())

export function installCityGazetteer(records: readonly CityGazetteerRecord[]): void {
  const index = new Map<string, CityGazetteerRecord[]>()
  for (const record of records) {
    const key = `${record[0]}:${record[1]}`
    const entries = index.get(key)
    if (entries) entries.push(record)
    else index.set(key, [record])
  }
  cityNames.value = index
}
