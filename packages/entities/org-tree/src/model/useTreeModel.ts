import { useCallback, useState, type MouseEvent } from 'react';
import { useTheme } from 'styled-components';
import { useTreeLayout } from '../lib/useTreeLayout';
import {
  useDefaultExpandedIds,
  useOrgTree,
  useOrgTreeStructure,
  useOrgTreeUpdates,
  useVisibleOrgTree,
} from './hooks';
import { DEFAULT_ORG_TREE_PARAMS, type OrgTreeParams } from './params';
import type { RevealRequest } from './selection';
import { useExpansion } from './useExpansion';

interface TreeBaseProps {
  /** Параметры запроса. Дерево показывает все узлы при любом `q`; `q` влияет на `matches`. */
  params?: OrgTreeParams;
  selectedId?: string | null;
  /** Клик по карточке или Enter/Space на названии узла. */
  onSelect?: (id: string) => void;
  /** Приглушать узлы с `matches: false`. Страница включает, только когда таблица на экране. */
  dimUnmatched?: boolean;
  revealRequest?: RevealRequest | null;
}

/** Раскрытием управляет владелец состояния (`useExpansion` выше по дереву). */
interface ControlledExpansionProps {
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleRecursive: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  defaultExpandedIds?: never;
}

/** Дерево само вызывает `useExpansion`: раскрытие по умолчанию — `defaultExpandedIds` или первый уровень. */
interface UncontrolledExpansionProps {
  expandedIds?: undefined;
  onToggle?: never;
  onToggleRecursive?: never;
  onExpandAll?: never;
  onCollapseAll?: never;
  defaultExpandedIds?: ReadonlySet<string>;
}

export type OrgTreeViewProps = TreeBaseProps &
  (ControlledExpansionProps | UncontrolledExpansionProps);

/**
 * Модель дерева: данные и состояние запроса, раскрытие (своё или из пропсов), якорь холста,
 * разбор делегированного клика. Компонент дерева только рисует её.
 */
export function useTreeModel(props: OrgTreeViewProps) {
  const {
    params = DEFAULT_ORG_TREE_PARAMS,
    selectedId = null,
    onSelect,
    dimUnmatched = false,
    revealRequest = null,
  } = props;
  const { tree } = useTheme();
  const { status, error, hasData, isEmpty, isValidating, retry } = useOrgTree(params);
  const structure = useOrgTreeStructure(params);
  const computedDefault = useDefaultExpandedIds(params);

  // Хук вызывается всегда (правила хуков); в управляемом режиме его состояние не используется.
  const own = useExpansion({
    initialExpandedIds: props.defaultExpandedIds ?? computedDefault,
    structure,
  });
  const controlled = props.expandedIds !== undefined ? props : null;
  const expandedIds = controlled ? controlled.expandedIds : own.expandedIds;
  const toggle = controlled ? controlled.onToggle : own.toggle;
  const toggleRecursive = controlled ? controlled.onToggleRecursive : own.toggleRecursive;
  const expandAll = controlled ? controlled.onExpandAll : own.expandAll;
  const collapseAll = controlled ? controlled.onCollapseAll : own.collapseAll;

  // Узел, чья позиция на экране сохраняется при смене раскладки: по нему кликнули.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const firstLevelId = structure.firstLevelIds[0] ?? null;

  const visibleTree = useVisibleOrgTree(params, expandedIds);
  const updates = useOrgTreeUpdates();
  const layout = useTreeLayout(visibleTree, tree.nodeSize);

  // Один делегированный слушатель на весь холст вместо обработчика на каждом узле.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as Element;
      const id = target.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!id) {
        return;
      }
      if (target.closest('[data-chevron]')) {
        setAnchorId(id);
        if (event.altKey) {
          toggleRecursive(id);
        } else {
          toggle(id);
        }
        return;
      }
      onSelect?.(id);
    },
    [toggle, toggleRecursive, onSelect],
  );

  const handleExpandAll = useCallback(() => {
    setAnchorId(firstLevelId);
    expandAll();
  }, [expandAll, firstLevelId]);

  const handleCollapseAll = useCallback(() => {
    setAnchorId(firstLevelId);
    collapseAll();
  }, [collapseAll, firstLevelId]);

  return {
    status,
    error,
    hasData,
    isEmpty,
    isValidating,
    retry,
    /** Данные есть и не пусты: холст и кнопки раскрытия доступны. */
    hasTree: hasData && !isEmpty,
    isRequesting: status === 'loading',
    layout,
    /** Номера патчей, изменивших значения узлов: для подсветки полей карточки. */
    updates,
    expandedIds,
    selectedId,
    dimUnmatched,
    revealRequest,
    anchorId,
    handleClick,
    expandAll: handleExpandAll,
    collapseAll: handleCollapseAll,
  };
}
