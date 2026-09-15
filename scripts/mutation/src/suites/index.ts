import type { Suite } from '../types.ts';
import {
  entitiesAggregateSuite,
  entitiesIsEqualSuite,
  entitiesSchemaSuite,
  entitiesSelectorsSuite,
} from './entities-org-tree.ts';
import { sharedQuerySuite } from './shared-query.ts';
import { sharedTidyTreeSuite } from './shared-tidy-tree.ts';
import { webSuperviseSuite } from './web-supervise.ts';
import {
  entitiesExpansionSuite,
  entitiesLayoutForestSuite,
  entitiesNodeMetricsSuite,
} from './entities-org-tree-view.ts';

export const suites: Suite[] = [
  sharedQuerySuite,
  sharedTidyTreeSuite,
  entitiesIsEqualSuite,
  entitiesSchemaSuite,
  entitiesAggregateSuite,
  entitiesSelectorsSuite,
  entitiesExpansionSuite,
  entitiesLayoutForestSuite,
  entitiesNodeMetricsSuite,
  webSuperviseSuite,
];
