const TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

export function clockTime(now: number | Date): string { return TIME_FORMAT.format(now) }
export function clockDate(now: number | Date): string { return DATE_FORMAT.format(now) }
