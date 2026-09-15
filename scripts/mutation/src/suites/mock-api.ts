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
