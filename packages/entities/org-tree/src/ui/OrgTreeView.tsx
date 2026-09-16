import type { LayoutNode } from '@shared/tidy-tree';
import { useCallback } from 'react';
import styled from 'styled-components';
import { getNodeMetrics } from '../lib/nodeMetrics';
import type { OrgTreeItem } from '../model/selectors';
import { useTreeModel, type OrgTreeViewProps } from '../model/useTreeModel';
import { OrgNodeCard } from './OrgNodeCard';
import { Button, ErrorBanner, Frame, Toolbar, ValidatingBadge } from './primitives';
import { EmptyState, ErrorState, TreeSkeleton } from './states';
import { TreeCanvas } from './TreeCanvas';

export type { OrgTreeViewProps } from '../model/useTreeModel';

const Root = styled.section`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const TreeArea = styled.div`
  height: 100%;
`;

/**
 * Дерево оргструктуры: состояния загрузки/ошибки/пустого ответа, холст, кнопки раскрытия.
 * Раскрытие управляемое (`expandedIds` и колбэки) или своё (`defaultExpandedIds`); логика —
 * в `useTreeModel`.
 */
export function OrgTreeView(props: OrgTreeViewProps) {
  const model = useTreeModel(props);
  const { expandedIds, selectedId, dimUnmatched, updates } = model;

  const renderNode = useCallback(
    (node: LayoutNode<OrgTreeItem>) => {
      const metrics = getNodeMetrics(node.data);
      const nodeUpdates = updates[node.id];
      return (
        <OrgNodeCard
          id={node.id}
          name={node.data.node.name}
          ownHeadcount={metrics.ownHeadcount}
          totalHeadcount={metrics.totalHeadcount}
          ownPerformance={metrics.ownPerformance}
          ownPerformanceLevel={metrics.ownPerformanceLevel}
          totalPerformance={metrics.totalPerformance}
          totalPerformanceLevel={metrics.totalPerformanceLevel}
          childCount={node.data.childCount}
          expanded={expandedIds.has(node.id)}
          width={node.width}
          height={node.height}
          selected={node.id === selectedId}
          dimmed={dimUnmatched && !node.data.matches}
          ownHeadcountUpdate={nodeUpdates?.ownHeadcount}
          totalHeadcountUpdate={nodeUpdates?.totalHeadcount}
          ownPerformanceUpdate={nodeUpdates?.ownPerformance}
          totalPerformanceUpdate={nodeUpdates?.totalPerformance}
        />
      );
    },
    [expandedIds, selectedId, dimUnmatched, updates],
  );

  let content;
  if (model.hasTree) {
    content = (
      <TreeArea onClick={model.handleClick}>
        <TreeCanvas
          layout={model.layout}
          renderNode={renderNode}
          anchorId={model.anchorId}
          revealRequest={model.revealRequest}
          aria-label="Оргструктура"
        />
      </TreeArea>
    );
  } else if (model.hasData) {
    content = <EmptyState />;
  } else if (model.status === 'error') {
    content = (
      <ErrorState
        message={model.error?.message}
        onRetry={model.retry}
        retrying={model.isRequesting}
      />
    );
  } else {
    content = <TreeSkeleton />;
  }

  return (
    <Root>
      <Toolbar>
        <Button type="button" onClick={model.expandAll} disabled={!model.hasTree}>
          Развернуть всё
        </Button>
        <Button type="button" onClick={model.collapseAll} disabled={!model.hasTree}>
          Свернуть всё
        </Button>
      </Toolbar>
      <Frame>
        {content}
        {model.hasData && model.status === 'error' && (
          <ErrorBanner role="alert">
            Не удалось обновить данные
            <Button type="button" onClick={model.retry} disabled={model.isRequesting}>
              Повторить
            </Button>
          </ErrorBanner>
        )}
        <ValidatingBadge role="status" data-active={model.isValidating}>
          Обновление…
        </ValidatingBadge>
      </Frame>
    </Root>
  );
}
