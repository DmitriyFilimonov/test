import type {} from '@shared/theme'; // подключает аугментацию DefaultTheme
import {
  OrgTable,
  OrgTreeView,
  useTableModel,
  type OrgTreeParams,
  type RevealRequest,
  type StructuredFilter,
} from '@entities/org-tree';
import styled from 'styled-components';
import { useOrgDashboardModel } from './model/useOrgDashboardModel';
import { FilterBar } from './ui/FilterBar';
import { LiveIndicator } from './ui/LiveIndicator';
import { ViewSwitcher } from './ui/ViewSwitcher';

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => `${theme.space.sm} ${theme.space.lg}`};
  margin-bottom: ${({ theme }) => theme.space.md};
`;

const Title = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xl};
`;

/*
 * Панели на своих местах во всех режимах: смена режима добавляет или убирает соседнюю, не
 * перемонтируя оставшуюся. В split высоту ряда задаёт дерево, таблица занимает её и
 * прокручивается внутри.
 */
const Panes = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space.md};
  flex: 1;
  min-height: 0;

  &[data-view='split'] {
    grid-template-columns: minmax(0, 1fr) minmax(720px, 1fr);
  }

  & > [data-pane] {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  & > [data-pane='tree'] > * {
    flex: 1;
    min-height: 0;
  }

  & > [data-pane='table'] > [data-table-container] {
    flex: 1;
    min-height: 0;
  }
`;

const Pane = styled.div`
  min-width: 0;
`;

/* Индикатор разбора — фиксированная ширина, не сдвигает макет. */
const ParsingIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  padding: 0 ${({ theme }) => theme.space.xs};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ParsingDots = styled.span`
  display: inline-block;
  width: 1em;
  text-align: center;

  &::after {
    content: '…';
    animation: dots 1.5s steps(4, end) infinite;
  }

  @keyframes dots {
    0% {
      content: '';
    }
    25% {
      content: '.';
    }
    50% {
      content: '..';
    }
    75% {
      content: '...';
    }
  }
`;

interface TablePaneProps {
  params: OrgTreeParams;
  onParamsChange: (params: OrgTreeParams) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  revealRequest: RevealRequest | null;
  structuredFilter?: StructuredFilter;
}

/**
 * Модель таблицы — в отдельном компоненте: черновик фильтра меняется на каждое нажатие и
 * перерисовывает только таблицу, а не страницу с деревом.
 */
function TablePane({
  params,
  onParamsChange,
  selectedId,
  onSelect,
  revealRequest,
  structuredFilter,
}: TablePaneProps) {
  const model = useTableModel({ params, onParamsChange, structuredFilter });
  return (
    <OrgTable
      model={model}
      selectedId={selectedId}
      onSelect={onSelect}
      revealRequest={revealRequest}
    />
  );
}

const PageRoot = styled.div`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  padding: ${({ theme }) => theme.space.md};
`;

export function OrgDashboardPage() {
  const model = useOrgDashboardModel();
  const { expansion } = model;

  return (
    <PageRoot>
      <Header>
        <Title>Оргструктура</Title>
        <ViewSwitcher views={model.views} value={model.view} onChange={model.setView} />
        <LiveIndicator />
      </Header>
      <Panes data-view={model.view}>
        {model.showTree && (
          <Pane data-pane="tree">
            <OrgTreeView
              params={model.params}
              expandedIds={expansion.expandedIds}
              onToggle={expansion.toggle}
              onToggleRecursive={expansion.toggleRecursive}
              onExpandAll={expansion.expandAll}
              onCollapseAll={expansion.collapseAll}
              selectedId={model.selectedId}
              onSelect={model.selectFromTree}
              dimUnmatched={model.dimUnmatched}
              revealRequest={model.treeReveal}
            />
          </Pane>
        )}
        {model.showTable && (
          <Pane data-pane="table">
            {model.hasStructuredFilter && (
              <FilterBar
                explanation={model.filterExplanation}
                filter={model.structuredFilter}
                onRemoveCondition={model.removeFilterCondition}
                onSearchByText={model.searchByText}
                onClear={model.clearStructuredFilter}
              />
            )}
            {model.isParsing && !model.hasStructuredFilter && (
              <ParsingIndicator>
                Разбор
                <ParsingDots />
              </ParsingIndicator>
            )}
            <div data-table-container>
              <TablePane
                params={model.params}
                onParamsChange={model.setParams}
                selectedId={model.selectedId}
                onSelect={model.selectFromTable}
                revealRequest={model.tableReveal}
                structuredFilter={model.structuredFilter}
              />
            </div>
          </Pane>
        )}
      </Panes>
    </PageRoot>
  );
}
