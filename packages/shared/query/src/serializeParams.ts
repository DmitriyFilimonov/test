const compareKeys = ([a]: [string, unknown], [b]: [string, unknown]) =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Стабильная сериализация параметров запроса в ключ кеша: ключи объектов упорядочены,
 * поля со значением undefined опускаются (так делает JSON.stringify). `{ b: 1, a: 2 }`,
 * `{ a: 2, b: 1 }` и `{ a: 2, b: 1, c: undefined }` дают один ключ. Параметров нет
 * (undefined) — пустая строка.
 */
export function serializeParams(params: unknown): string {
  return (
    JSON.stringify(params, (_key, value: unknown) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(compareKeys))
        : value,
    ) ?? ''
  );
}
