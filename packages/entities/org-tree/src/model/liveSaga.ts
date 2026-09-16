import type { UnknownAction } from '@reduxjs/toolkit';
import { put, select, take } from 'typed-redux-saga';
import { getAggregateIndex, setAggregateIndex } from './aggregateIndex';
import { orgTreeLive, type OrgTreePatch } from './live';
import { applyOrgTreePatch } from './livePatch';
import type { OrgTreeParams } from './params';
import { orgTreeQuery } from './query';
import { orgTreeUpdatesRecorded } from './updates';

const { subscribed, requested, patched, invalidated } = orgTreeQuery.actions;
const { messageReceived } = orgTreeLive.sagaActions;

/**
 * Записи других ключей протухают, но не патчатся: их matches и order считает сервер, пересчёт на
 * клиенте продублировал бы серверную сортировку. При возврате к ключу данные перезапросятся.
 */
function* invalidateOtherKeys(params: OrgTreeParams) {
  const key = orgTreeQuery.getKey(params);
  yield* put(invalidated((other) => other !== key));
}

/** Пропущены патчи: данные текущего ключа — полным перезапросом. */
function* resync(params: OrgTreeParams) {
  yield* put(requested(params, { force: true }));
  yield* invalidateOtherKeys(params);
}

function* applyPatch(params: OrgTreeParams, patch: OrgTreePatch) {
  // Свои данные ключа, не заглушка прежнего: заглушку патчить некуда, данные ключа уже в пути.
  const { data, isPlaceholder } = yield* select(orgTreeQuery.selectors.selectState, params);
  if (data !== undefined && !isPlaceholder) {
    const result = applyOrgTreePatch(data, getAggregateIndex(data), patch, params.q);
    // Индекс — в кеш до того, как данные попадут в стор: селектор прочитает готовый и полного
    // расчёта не запустит. select и put — один синхронный шаг саги, данные между ними те же.
    setAggregateIndex(result.nodes, result.index);
    yield* put(patched(params, () => result.nodes));
    if (Object.keys(result.updates).length > 0 || result.removed.length > 0) {
      yield* put(orgTreeUpdatesRecorded({ updates: result.updates, removed: result.removed }));
    }
  }
  yield* invalidateOtherKeys(params);
}

/**
 * Поток изменений → кеш оргдерева. Патч применяется к записи текущего ключа — последнего, на
 * который подписался UI, — без запроса. Перезапрос — только при пропуске seq: пришёл номер
 * больше ожидаемого (патчи между ними потеряны) или hello после переподключения с другим
 * номером (пока соединения не было, сервер ушёл вперёд или перезапустился).
 */
export function* orgTreeLivePatchSaga() {
  let params: OrgTreeParams | undefined;
  /** seq последнего учтённого события; null — событий ещё не было. */
  let lastSeq: number | null = null;

  while (true) {
    const action = yield* take<UnknownAction>([subscribed.type, messageReceived.type]);
    if (subscribed.match(action)) {
      params = action.payload.params;
      continue;
    }
    if (!messageReceived.match(action)) {
      continue;
    }
    const { event } = action.payload;
    const previous = lastSeq;

    if (event.type === 'hello') {
      lastSeq = event.seq;
      if (params && previous !== null && event.seq !== previous) {
        yield* resync(params);
      }
      continue;
    }

    // Повтор уже учтённого патча.
    if (previous !== null && event.seq <= previous) {
      continue;
    }
    lastSeq = event.seq;
    if (!params) {
      continue;
    }
    if (previous !== null && event.seq > previous + 1) {
      yield* resync(params);
    } else {
      yield* applyPatch(params, event);
    }
  }
}
