/** 每行一个名称，名称中的空格和逗号不作为分隔符。 */
export function parseGroupOrder(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map(name => name.trim())
    .filter(name => name.length > 0 && name !== '__all__'))]
}

/** 未指定的分组保持原顺序，新增分组自动接在已指定分组之后。 */
export function orderedGroups(groups: readonly string[], order: string): string[] {
  const available = new Set(groups.filter(name => name !== '__all__'))
  const preferred = parseGroupOrder(order).filter(name => available.has(name))
  return [...new Set([...preferred, ...available])]
}

export function moveGroup(groups: readonly string[], name: string, direction: -1 | 1): string[] {
  const result = [...groups]
  const index = result.indexOf(name)
  const target = index + direction
  if (index < 0 || target < 0 || target >= result.length) return result
  const adjacent = result[target]
  if (adjacent === undefined) return result
  result[index] = adjacent
  result[target] = name
  return result
}
