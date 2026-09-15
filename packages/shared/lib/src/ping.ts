/** Тривиальная функция для проверки сквозного резолва workspace-пакетов. */
export function ping(caller: string): string {
  return `pong from @shared/lib to ${caller}`;
}
