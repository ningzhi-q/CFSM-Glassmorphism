import { Converter } from 'opencc-js/t2cn'
import { cityNames } from '@/stores/city-names'
import type { CityGazetteerRecord } from '@/types/city-names'

// Ported from Komari Glassmorphism cityNameHelper.ts (MIT).
const CITY_NAME_ZH_MAP: Record<string, string> = {
  'iola': '艾奥拉',
  'chengdu': '成都',
  'jeddah': '吉达',
  'kampong loyang': '罗央',
  'sultanbeyli': '苏丹贝伊利',
  'tung chung': '东涌',
  'tampines': '淡滨尼',
  'kwai chung': '葵涌',
  'cheung sha wan': '长沙湾',
  'kwun tong': '观塘',
  'wan chai': '湾仔',
  'mong kok': '旺角',
  'newark': '纽瓦克',
  'jinan': '济南',
  'frankfurt am main': '法兰克福',
  'inzai': '印西',
  'chuncheon': '春川',
  'loyang': '罗央',
  'montreal': '蒙特利尔',
  'the hague': '海牙',
  'deyang': '德阳',
  'changhua': '彰化',
  'bursa': '布尔萨',
  'pomezia': '波梅齐亚',
  'năvodari': '纳沃达里',
  'canary wharf': '金丝雀码头',
  'singapore (tampines)': '新加坡（淡滨尼）',
  'boulder (downtown)': '博尔德（市中心）',
  "jeddah (al fayha'a)": '吉达（费哈区）',
  'singapore tampines': '新加坡（淡滨尼）',
  'boulder downtown': '博尔德（市中心）',
  'jeddah al fayhaa': '吉达（费哈区）',
  'barcelona': '巴塞罗那',
  'houston': '休斯敦',
  'amsterdam': '阿姆斯特丹',
  'ashburn': '阿什本',
  'atlanta': '亚特兰大',
  'bangkok': '曼谷',
  'beijing': '北京',
  'bengaluru': '班加罗尔',
  'berlin': '柏林',
  'buffalo': '布法罗',
  'chicago': '芝加哥',
  'chongqing': '重庆',
  'dallas': '达拉斯',
  'delhi': '德里',
  'denver': '丹佛',
  'dubai': '迪拜',
  'dusseldorf': '杜塞尔多夫',
  'frankfurt': '法兰克福',
  'fremont': '弗里蒙特',
  'guangzhou': '广州',
  'hamburg': '汉堡',
  'helsinki': '赫尔辛基',
  'ho chi minh city': '胡志明市',
  'hong kong': '香港',
  'istanbul': '伊斯坦布尔',
  'jakarta': '雅加达',
  'johannesburg': '约翰内斯堡',
  'kuala lumpur': '吉隆坡',
  'las vegas': '拉斯维加斯',
  'london': '伦敦',
  'los angeles': '洛杉矶',
  'madrid': '马德里',
  'melbourne': '墨尔本',
  'miami': '迈阿密',
  'milan': '米兰',
  'moscow': '莫斯科',
  'mumbai': '孟买',
  'new york': '纽约',
  'osaka': '大阪',
  'paris': '巴黎',
  'phoenix': '凤凰城',
  'prague': '布拉格',
  'san francisco': '旧金山',
  'san jose': '圣何塞',
  'sao paulo': '圣保罗',
  'seattle': '西雅图',
  'seoul': '首尔',
  'shanghai': '上海',
  'shenzhen': '深圳',
  'singapore': '新加坡',
  'stockholm': '斯德哥尔摩',
  'sydney': '悉尼',
  'taipei': '台北',
  'tokyo': '东京',
  'toronto': '多伦多',
  'vienna': '维也纳',
  'warsaw': '华沙',
  'washington': '华盛顿',
  'zurich': '苏黎世',
}

const CITY_SEPARATOR_REGEX = /[._-]+/g
const CITY_SPACES_REGEX = /\s+/g
const CJK_UNIFIED_IDEOGRAPH_REGEX = /\p{Script=Han}/u

function normalizeCityName(city: string): string {
  return city
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(CITY_SEPARATOR_REGEX, ' ')
    .replace(CITY_SPACES_REGEX, ' ')
    .trim()
}

const simplify = Converter({ from: 't', to: 'cn' })
const upstreamNames = new Map(Object.entries(CITY_NAME_ZH_MAP).map(([alias, name]) => [normalizeCityName(alias), name]))
// Administrative aliases are country-scoped: Central elsewhere is not Hong Kong's 中环.
const countryNames = new Map([['HK:central', '中环']])
type GazetteerRecord = CityGazetteerRecord
let previousIndex = cityNames.value
const formattedNames = new Map<string, string>()
interface CityCoordinates { latitude: number; longitude: number }

/** Exact city aliases only. Coordinates disambiguate homonyms; they never infer a city. */
export function formatCityNameZh(city: string | null | undefined, countryCode?: string, coordinates?: CityCoordinates): string {
  if (!city?.trim()) return ''
  const trimmed = city.trim()
  const alias = normalizeCityName(trimmed)
  const country = countryCode?.toUpperCase() ?? ''
  const key = `${country}:${alias}:${coordinates?.latitude ?? ''}:${coordinates?.longitude ?? ''}`
  if (previousIndex !== cityNames.value) {
    formattedNames.clear()
    previousIndex = cityNames.value
  }
  const cached = formattedNames.get(key)
  if (cached !== undefined) return cached

  let name = countryNames.get(`${country}:${alias}`) ?? upstreamNames.get(alias) ?? ''
  if (!name && CJK_UNIFIED_IDEOGRAPH_REGEX.test(trimmed) && !/[a-z]/i.test(trimmed)) name = simplify(trimmed)
  if (!name && country) {
    const matches = cityNames.value.get(`${country}:${alias}`) ?? []
    const names = new Set(matches.map(record => record[2]))
    if (names.size === 1) name = matches[0]?.[2] ?? ''
    else if (coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)) {
      let nearest: GazetteerRecord | undefined
      let distance = Infinity
      for (const record of matches) {
        const delta = (coordinates.latitude - record[3]) ** 2
          + ((coordinates.longitude - record[4]) * Math.cos(coordinates.latitude * Math.PI / 180)) ** 2
        if (delta < distance) { distance = delta; nearest = record }
      }
      if (nearest && distance <= 1) name = nearest[2]
    }
  }
  formattedNames.set(key, name)
  if (formattedNames.size > 512) {
    const oldest = formattedNames.keys().next().value
    if (oldest !== undefined) formattedNames.delete(oldest)
  }
  return name
}
