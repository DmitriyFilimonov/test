import { createQuery } from '@shared/query';
import { fetchOrgTree } from '../api/fetchOrgTree';
import { isSameOrgTree } from './isEqual';
import { parseOrgTree } from './schema';

export const ORG_TREE_STALE_TIME = 5000;

export const orgTreeQuery = createQuery({
  name: 'orgTree',
  fetcher: fetchOrgTree,
  parse: parseOrgTree,
  isEqual: isSameOrgTree,
  staleTime: ORG_TREE_STALE_TIME,
});
