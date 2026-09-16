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
import { entitiesAggregatePatchSuite } from './entities-aggregate-patch.ts';
import {
  entitiesCardHighlightSuite,
  entitiesFreshUpdatesSuite,
  entitiesLivePatchSuite,
  entitiesLiveSagaSuite,
  entitiesRowHighlightSuite,
  entitiesSelectorsStructureSuite,
  entitiesUpdateHighlightSuite,
  sharedQueryPatchSuite,
} from './live-apply.ts';
import {
  entitiesLayoutTransitionSuite,
  entitiesTableKeyboardSuite,
  entitiesTableRowFocusSuite,
  entitiesTreeEdgeMotionSuite,
  entitiesTreeMotionSuite,
} from './keyboard-motion.ts';
import {
  entitiesSearchParseSuite,
  entitiesStructuredFilterSuite,
  entitiesTableStructuredFilterSuite,
  mockApiSearchParseSuite,
  pagesDashboardAiSearchPageSuite,
  pagesDashboardAiSearchSuite,
} from './search-parse.ts';
import {
  entitiesOrgTableRowSuite,
  entitiesOrgTableSuite,
  entitiesTableModelSuite,
} from './entities-org-table.ts';
import {
  mockApiOrgTreeQuerySuite,
  mockApiStreamHubSuite,
  mockApiStreamRoutesSuite,
} from './mock-api.ts';
import {
  sharedQueryKeySuite,
  sharedQuerySubscriptionSuite,
  sharedQuerySuite,
} from './shared-query.ts';
import { sharedLiveBackoffSuite, sharedLiveChannelsSuite, sharedLiveSuite } from './shared-live.ts';
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
  sharedQueryPatchSuite,
  sharedLiveBackoffSuite,
  sharedLiveSuite,
  sharedLiveChannelsSuite,
  sharedTidyTreeSuite,
  entitiesIsEqualSuite,
  entitiesSchemaSuite,
  entitiesAggregateSuite,
  entitiesAggregatePatchSuite,
  entitiesSelectorsSuite,
  entitiesSelectorsStructureSuite,
  entitiesLivePatchSuite,
  entitiesLiveSagaSuite,
  entitiesTableSuite,
  entitiesFormatSuite,
  entitiesTableModelSuite,
  entitiesOrgTableSuite,
  entitiesOrgTableRowSuite,
  entitiesTableKeyboardSuite,
  entitiesTableRowFocusSuite,
  entitiesRowHighlightSuite,
  entitiesCardHighlightSuite,
  entitiesUpdateHighlightSuite,
  entitiesFreshUpdatesSuite,
  entitiesFetchSuite,
  entitiesExpansionSuite,
  entitiesUseExpansionSuite,
  entitiesTreeModelSuite,
  entitiesOrgTreeViewSuite,
  entitiesOrgNodeCardSuite,
  entitiesTreeCanvasRevealSuite,
  entitiesLayoutTransitionSuite,
  entitiesTreeMotionSuite,
  entitiesTreeEdgeMotionSuite,
  entitiesRevealBoxSuite,
  entitiesLayoutForestSuite,
  entitiesNodeMetricsSuite,
  pagesDashboardParamsSuite,
  pagesDashboardSearchSuite,
  pagesSplitAvailableSuite,
  pagesDashboardModelSuite,
  pagesDashboardPageSuite,
  entitiesStructuredFilterSuite,
  entitiesTableStructuredFilterSuite,
  entitiesSearchParseSuite,
  pagesDashboardAiSearchSuite,
  pagesDashboardAiSearchPageSuite,
  webSuperviseSuite,
  mockApiOrgTreeQuerySuite,
  mockApiStreamHubSuite,
  mockApiStreamRoutesSuite,
  mockApiSearchParseSuite,
];
