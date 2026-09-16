import { createLiveSource, type LiveMessage } from '@shared/live';
import { z } from 'zod';
import { OrgTreeContractError, orgNodeSchema } from './schema';

const seqSchema = z.number().int().min(0);

/** Изменённые поля узла; updatedAt приходит при любом изменении. */
export const orgNodeChangeSchema = z.strictObject({
  id: orgNodeSchema.shape.id,
  headcount: orgNodeSchema.shape.headcount.optional(),
  budget: orgNodeSchema.shape.budget.optional(),
  performance: orgNodeSchema.shape.performance.optional(),
  updatedAt: orgNodeSchema.shape.updatedAt,
});

export const orgTreeHelloSchema = z.strictObject({ seq: seqSchema });

/** Добавленный узел — как в ответе GET, но без matches и order: они зависят от параметров запроса. */
export const orgTreePatchSchema = z.strictObject({
  seq: seqSchema,
  nodes: z.array(orgNodeChangeSchema),
  removed: z.array(orgNodeSchema.shape.id),
  added: z.array(orgNodeSchema.omit({ matches: true, order: true })),
});

export type OrgNodeChange = z.infer<typeof orgNodeChangeSchema>;
export type OrgTreePatch = z.infer<typeof orgTreePatchSchema>;

export type OrgTreeLiveEvent =
  ({ type: 'hello' } & z.infer<typeof orgTreeHelloSchema>) | ({ type: 'patch' } & OrgTreePatch);

const EVENT_SCHEMAS = { hello: orgTreeHelloSchema, patch: orgTreePatchSchema } as const;
type OrgTreeLiveEventType = keyof typeof EVENT_SCHEMAS;

/** Разбор события потока. Любое нарушение — исключение: источник пропустит событие. */
export function parseOrgTreeLiveEvent({ type, data }: LiveMessage): OrgTreeLiveEvent {
  if (!Object.hasOwn(EVENT_SCHEMAS, type)) {
    throw new OrgTreeContractError(`Неизвестное событие потока "${type}"`);
  }
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch (error) {
    throw new OrgTreeContractError(`Событие "${type}": data не JSON`, { cause: error });
  }
  const result = EVENT_SCHEMAS[type as OrgTreeLiveEventType].safeParse(json);
  if (!result.success) {
    throw new OrgTreeContractError(
      `Событие "${type}" не соответствует контракту:\n${z.prettifyError(result.error)}`,
    );
  }
  return { type, ...result.data } as OrgTreeLiveEvent;
}

/**
 * Поток изменений оргдерева. Пока только соединение и lastSeq: патчи к данным не применяются.
 */
export const orgTreeLive = createLiveSource({
  name: 'orgTreeLive',
  url: '/api/org-tree/stream',
  eventTypes: Object.keys(EVENT_SCHEMAS),
  parse: parseOrgTreeLiveEvent,
});
