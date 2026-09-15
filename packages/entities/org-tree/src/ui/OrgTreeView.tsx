import { useCallback, useMemo, useReducer, useState, type MouseEvent } from 'react';
import { useOrgTree, useOrgTreeStructure, useVisibleOrgTree } from '../model/hooks';
import { collectExpandableSubtreeIds, type OrgTreeItem } from '../model/selectors';
import type { LayoutNode } from '@shared/tidy-tree';
import styled, { useTheme } from 'styled-components';
import { getNodeMetrics } from '../lib/nodeMetrics';
import { useTreeLayout } from '../lib/useTreeLayout';
import { expansionReducer } from '../model/expansion';
import { OrgNodeCard } from './OrgNodeCard';
import { Button, ErrorBanner, Frame, Toolbar, ValidatingBadge } from './primitives';
import { EmptyState, ErrorState, TreeSkeleton } from './states';
import { TreeCanvas } from './TreeCanvas';

const TreeArea = styled.div`
  height: 100%;
`;

/** Дерево оргструктуры: данные, состояния загрузки/ошибки/пустого ответа, раскрытие, холст. */
export function OrgTreeView() {
  const { tree } = useTheme();
  const { status, error, hasData, isEmpty, isValidating, retry } = useOrgTree();
  const { firstLevelIds, expandableIds, childrenIndex } = useOrgTreeStructure();

  // Раскрытие — локальное состояние компонента. По умолчанию раскрыты узлы первого уровня:
  // видны дивизионы и отделы, команды скрыты.
  const [expansion, dispatchExpansion] = useReducer(expansionReducer, null);
  const defaultExpanded = useMemo(() => new Set(firstLevelIds), [firstLevelIds]);
  const expandedIds = expansion ?? defaultExpanded;
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const visibleTree = useVisibleOrgTree(expandedIds);
  const layout = useTreeLayout(visibleTree, tree.nodeSize);

  // Один делегированный слушатель на весь холст вместо обработчика на каждом узле.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const chevron = (event.target as Element).closest('[data-chevron]');
      const id = chevron?.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!id) {
        return;
      }
      setAnchorId(id);
      if (event.altKey) {
        dispatchExpansion({
          type: 'expand',
          ids: collectExpandableSubtreeIds(childrenIndex, id),
          current: expandedIds,
        });
      } else {
        dispatchExpansion({ type: 'toggle', id, current: expandedIds });
      }
    },
    [childrenIndex, expandedIds],
  );

  const expandAll = useCallback(() => {
    setAnchorId(firstLevelIds[0] ?? null);
    dispatchExpansion({ type: 'replace', ids: expandableIds });
  }, [expandableIds, firstLevelIds]);

  const collapseAll = useCallback(() => {
    setAnchorId(firstLevelIds[0] ?? null);
    dispatchExpansion({ type: 'replace', ids: [] });
  }, [firstLevelIds]);

  const renderNode = useCallback(
    (node: LayoutNode<OrgTreeItem>) => {
      const metrics = getNodeMetrics(node.data);
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
        />
      );
    },
    [expandedIds],
  );

  const hasTree = hasData && !isEmpty;
  const isRequesting = status === 'loading';

  let content;
  if (hasTree) {
    content = (
      <TreeArea onClick={handleClick}>
        <TreeCanvas
          layout={layout}
          renderNode={renderNode}
          anchorId={anchorId}
          aria-label="Оргструктура"
        />
      </TreeArea>
    );
  } else if (hasData) {
    content = <EmptyState />;
  } else if (status === 'error') {
    content = <ErrorState message={error?.message} onRetry={retry} retrying={isRequesting} />;
  } else {
    content = <TreeSkeleton />;
  }

  return (
    <section>
      <Toolbar>
        <Button type="button" onClick={expandAll} disabled={!hasTree}>
          Развернуть всё
        </Button>
        <Button type="button" onClick={collapseAll} disabled={!hasTree}>
          Свернуть всё
        </Button>
      </Toolbar>
      <Frame>
        {content}
        {hasData && status === 'error' && (
          <ErrorBanner role="alert">
            Не удалось обновить данные
            <Button type="button" onClick={retry} disabled={isRequesting}>
              Повторить
            </Button>
          </ErrorBanner>
        )}
        <ValidatingBadge role="status" data-active={isValidating}>
          Обновление…
        </ValidatingBadge>
      </Frame>
    </section>
  );
}
