import type { Suite } from '../types.ts';
import {
  entitiesAggregateSuite,
  entitiesFetchSuite,
  entitiesFormatSuite,
  entitiesIsEqualSuite,
  entitiesSchemaSuite,
  entitiesSelectorsSuite,
  entitiesTableSuite,
} from './entities-org-tree.ts';
import {
  entitiesOrgTableRowSuite,
  entitiesOrgTableSuite,
  entitiesTableModelSuite,
} from './entities-org-table.ts';
import { mockApiOrgTreeQuerySuite } from './mock-api.ts';
import {
  sharedQueryKeySuite,
  sharedQuerySubscriptionSuite,
  sharedQuerySuite,
} from './shared-query.ts';
import { sharedTidyTreeSuite } from './shared-tidy-tree.ts';
import { webSuperviseSuite } from './web-supervise.ts';
import {
  entitiesExpansionSuite,
  entitiesLayoutForestSuite,
  entitiesNodeMetricsSuite,
  entitiesOrgNodeCardSuite,
  entitiesOrgTreeViewSuite,
  entitiesRevealBoxSuite,
  entitiesTreeCanvasRevealSuite,
  entitiesTreeModelSuite,
  entitiesUseExpansionSuite,
} from './entities-org-tree-view.ts';
import {
  pagesDashboardModelSuite,
  pagesDashboardPageSuite,
  pagesDashboardParamsSuite,
  pagesDashboardSearchSuite,
  pagesSplitAvailableSuite,
} from './pages-org-dashboard.ts';

export const suites: Suite[] = [
  sharedQuerySuite,
  sharedQueryKeySuite,
  sharedQuerySubscriptionSuite,
  sharedTidyTreeSuite,
  entitiesIsEqualSuite,
  entitiesSchemaSuite,
  entitiesAggregateSuite,
  entitiesSelectorsSuite,
  entitiesTableSuite,
  entitiesFormatSuite,
  entitiesTableModelSuite,
  entitiesOrgTableSuite,
  entitiesOrgTableRowSuite,
  entitiesFetchSuite,
  entitiesExpansionSuite,
  entitiesUseExpansionSuite,
  entitiesTreeModelSuite,
  entitiesOrgTreeViewSuite,
  entitiesOrgNodeCardSuite,
  entitiesTreeCanvasRevealSuite,
  entitiesRevealBoxSuite,
  entitiesLayoutForestSuite,
  entitiesNodeMetricsSuite,
  pagesDashboardParamsSuite,
  pagesDashboardSearchSuite,
  pagesSplitAvailableSuite,
  pagesDashboardModelSuite,
  pagesDashboardPageSuite,
  webSuperviseSuite,
  mockApiOrgTreeQuerySuite,
];
