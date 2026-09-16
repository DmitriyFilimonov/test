import { describe, expect, it } from 'vitest';
import { parseOrgTreeLiveEvent } from './live';
import { OrgTreeContractError } from './schema';

const message = (type: string, data: unknown) => ({
  type,
  data: typeof data === 'string' ? data : JSON.stringify(data),
  lastEventId: '',
});

const NODE = {
  id: 'org-new',
  name: 'Новая команда',
  parentId: 'org-parent',
  headcount: 5,
  budget: 1_000_000,
  performance: 70,
  updatedAt: '2026-09-15T10:00:00.000Z',
};

const PATCH = {
  seq: 4,
  nodes: [{ id: 'org-1', headcount: 7, performance: 64, updatedAt: '2026-09-15T10:00:00.000Z' }],
  removed: ['org-2'],
  added: [NODE],
};

describe('parseOrgTreeLiveEvent', () => {
  it('hello и patch разбираются; seq на верхнем уровне события', () => {
    expect(parseOrgTreeLiveEvent(message('hello', { seq: 0 }))).toEqual({ type: 'hello', seq: 0 });
    expect(parseOrgTreeLiveEvent(message('patch', PATCH))).toEqual({ type: 'patch', ...PATCH });
    expect(
      parseOrgTreeLiveEvent(
        message('patch', {
          seq: 1,
          nodes: [{ id: 'a', updatedAt: NODE.updatedAt }],
          removed: [],
          added: [],
        }),
      ),
    ).toMatchObject({ seq: 1 });
  });

  it.each([
    ['не JSON', message('patch', '{broken')],
    ['неизвестное событие', message('message', { seq: 1 })],
    ['hello без seq', message('hello', {})],
    ['seq строкой', message('hello', { seq: '1' })],
    ['seq дробный', message('hello', { seq: 1.5 })],
    ['patch без removed', message('patch', { ...PATCH, removed: undefined })],
    [
      'изменение без updatedAt',
      message('patch', { ...PATCH, nodes: [{ id: 'org-1', headcount: 1 }] }),
    ],
    [
      'performance больше 100',
      message('patch', { ...PATCH, nodes: [{ ...PATCH.nodes[0], performance: 101 }] }),
    ],
    [
      'лишнее поле в изменении',
      message('patch', { ...PATCH, nodes: [{ ...PATCH.nodes[0], name: 'x' }] }),
    ],
    ['added с matches', message('patch', { ...PATCH, added: [{ ...NODE, matches: true }] })],
    [
      'added без parentId',
      message('patch', { ...PATCH, added: [{ ...NODE, parentId: undefined }] }),
    ],
  ])('%s — OrgTreeContractError', (_label, input) => {
    expect(() => parseOrgTreeLiveEvent(input)).toThrow(OrgTreeContractError);
  });
});
