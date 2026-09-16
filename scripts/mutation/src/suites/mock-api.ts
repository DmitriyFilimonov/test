import type { Suite } from '../types.ts';

export const mockApiOrgTreeQuerySuite: Suite = {
  name: 'mock-api-org-tree-query',
  file: 'apps/mock-api/src/org-tree-query.ts',
  tests: 'apps/mock-api/src',
  mutations: [
    {
      name: 'matches учитывает совпадение предка',
      from: '    matches: normalize(node.name).includes(query),',
      to: '    matches: [node, ...nodes.filter((other) => other.id === node.parentId)].some((candidate) =>\n      normalize(candidate.name).includes(query),\n    ),',
    },
    {
      name: 'matches с учётом регистра',
      from: "const normalize = (text: string) => text.toLocaleLowerCase('ru');",
      to: 'const normalize = (text: string) => text;',
    },
    {
      name: 'order не уникален (равные значения получают один order)',
      from: '  sorted.forEach((row, position) => {\n    orderById.set(row.node.id, position);\n  });',
      to: '  sorted.forEach((row, position) => {\n    const previous = sorted[position - 1];\n    orderById.set(\n      row.node.id,\n      previous && compareRows(previous, row, params) === 0\n        ? orderById.get(previous.node.id)!\n        : position,\n    );\n  });',
    },
    {
      name: 'null-performance сортируется как 0',
      from: '      if (x === null || y === null) {\n        return x === y ? 0 : x === null ? 1 : -1;\n      }\n      return applyDirection(x - y, dir);',
      to: '      return applyDirection((x ?? 0) - (y ?? 0), dir);',
    },
    {
      name: 'desc — разворот asc (нестабильно, null в начале)',
      from: '  const sorted = rows.toSorted((a, b) => compareRows(a, b, params));',
      to: "  const sorted =\n    params.dir === 'desc'\n      ? rows.toSorted((a, b) => compareRows(a, b, { ...params, dir: 'asc' })).reverse()\n      : rows.toSorted((a, b) => compareRows(a, b, params));",
    },
    {
      name: 'totalHeadcount сортирует по собственному headcount',
      from: 'return applyDirection(a.totalHeadcount - b.totalHeadcount, dir);',
      to: 'return applyDirection(a.node.headcount - b.node.headcount, dir);',
    },
    {
      name: 'эффективность не взвешена по численности',
      from: 'weighted: node.performance * node.headcount,',
      to: 'weighted: node.performance,',
    },
    {
      name: 'level не растёт с глубиной',
      from: 'stack.push({ node: child, level: level + 1 });',
      to: 'stack.push({ node: child, level });',
    },
    {
      name: 'name сравнивается по кодам символов («ё» после «я»)',
      from: 'return applyDirection(collator.compare(a.node.name, b.node.name), dir);',
      to: 'return applyDirection(a.node.name < b.node.name ? -1 : a.node.name > b.node.name ? 1 : 0, dir);',
    },
    {
      name: 'невалидный sort/dir молча заменяется умолчанием',
      from: "  issues.push({\n    param,\n    message: `expected one of ${allowed.join(', ')}; received ${JSON.stringify(value)}`,\n  });\n",
      to: '',
    },
    {
      name: 'повторённый параметр молча заменяется умолчанием',
      from: "  issues.push({ param, message: 'must be passed at most once' });\n",
      to: '',
    },
  ],
};

const STREAM_TESTS = 'apps/mock-api/src/org-tree-stream.test.ts';

export const mockApiStreamHubSuite: Suite = {
  name: 'mock-api-stream-hub',
  file: 'apps/mock-api/src/org-tree-stream.ts',
  tests: STREAM_TESTS,
  mutations: [
    {
      name: 'hello без текущего seq',
      from: "res.write(frame('hello', { seq }));",
      to: "res.write(frame('hello', { seq: 0 }));",
    },
    {
      name: 'seq не растёт',
      from: '    seq += 1;\n',
      to: '',
    },
    {
      name: 'патч уходит только первому подписчику',
      from: '    for (const res of clients) {\n      res.write(text);\n    }',
      to: '    clients.values().next().value?.write(text);',
    },
    {
      name: 'нет heartbeat',
      from: "const heartbeat = setInterval(() => res.write(': ping\\n\\n'), heartbeatMs);",
      to: 'const heartbeat = undefined;',
    },
    {
      name: 'heartbeat событием, а не комментарием',
      from: "res.write(': ping\\n\\n')",
      to: "res.write('event: ping\\ndata: {}\\n\\n')",
    },
    {
      name: 'отключившийся клиент не снимается с рассылки',
      from: '      clients.delete(res);\n    });',
      to: '    });',
    },
    {
      name: 'kill не закрывает соединения',
      from: '      res.socket?.destroy();\n',
      to: '',
    },
  ],
};

export const mockApiStreamRoutesSuite: Suite = {
  name: 'mock-api-stream-routes',
  file: 'apps/mock-api/src/app.ts',
  tests: STREAM_TESTS,
  mutations: [
    {
      name: 'генерация включена по умолчанию',
      from: '  let generator: NodeJS.Timeout | undefined;\n',
      to: '  let generator: NodeJS.Timeout | undefined = setInterval(() => {\n    const result = updateRandomLeaf(nodes);\n    if (result) {\n      commit(result);\n    }\n  }, streamIntervalMs);\n',
    },
    {
      name: 'touch не рассылает патч',
      from: '    commit(result);\n\n    if (mode === ',
      to: '    nodes = result.nodes;\n\n    if (mode === ',
    },
    {
      name: 'stop не останавливает генерацию',
      from: "app.post('/api/dev/stream/stop', (_req, res) => {\n    stopGenerator();",
      to: "app.post('/api/dev/stream/stop', (_req, res) => {",
    },
    {
      name: 'emit по умолчанию меняет структуру (add)',
      from: "const { mode = 'update' } = req.query;\n    if (!EMIT_MODES",
      to: "const { mode = 'add' } = req.query;\n    if (!EMIT_MODES",
    },
    {
      name: 'генерация меняет структуру дерева',
      from: '    generator = setInterval(() => {\n      const result = updateRandomLeaf(nodes);',
      to: '    generator = setInterval(() => {\n      const result = addLeaf(nodes);',
    },
  ],
};
