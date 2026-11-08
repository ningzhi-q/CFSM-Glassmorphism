const OVERRIDES: Readonly<Record<string, string>> = {
  HK: '香港', MO: '澳门', TW: '台湾', US: '美国', GB: '英国', KR: '韩国',
}

const names = new Intl.DisplayNames(['zh-CN'], { type: 'region' })

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code
  return OVERRIDES[code] ?? names.of(code) ?? code
}
