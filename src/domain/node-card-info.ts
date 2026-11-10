export const NODE_CARD_INFO_FIELDS = [
  { key: 'uptime', label: '在线天数' },
  { key: 'price', label: '价格 / 计费周期' },
  { key: 'expiry', label: '剩余天数' },
  { key: 'remainingValue', label: '剩余价值' },
] as const

export type NodeCardInfoKey = typeof NODE_CARD_INFO_FIELDS[number]['key']
export const DEFAULT_NODE_CARD_INFO_FIELDS = NODE_CARD_INFO_FIELDS.map(field => field.key).join(',')

export function parseNodeCardInfoFields(value: string): NodeCardInfoKey[] {
  const keys = new Set(value.split(/[,\s]+/u))
  return NODE_CARD_INFO_FIELDS.filter(field => keys.has(field.key)).map(field => field.key)
}
