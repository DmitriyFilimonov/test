import type {} from '@shared/theme'; // подключает аугментацию DefaultTheme
import {
  OrgTable,
  OrgTreeView,
  useTableModel,
  type OrgTreeParams,
  type RevealRequest,
} from '@entities/org-tree';
import styled from 'styled-components';
import { useOrgDashboardModel } from './model/useOrgDashboardModel';
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

  &[data-view='split'] {
    grid-template-columns: minmax(0, 1fr) minmax(720px, 1fr);
  }

  &[data-view='split'] > [data-pane='table'] {
    position: relative;
  }

  &[data-view='split'] > [data-pane='table'] > * {
    position: absolute;
    inset: 0;
  }
`;

const Pane = styled.div`
  min-width: 0;
`;

interface TablePaneProps {
  params: OrgTreeParams;
  onParamsChange: (params: OrgTreeParams) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  revealRequest: RevealRequest | null;
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
}: TablePaneProps) {
  const model = useTableModel({ params, onParamsChange });
  return (
    <OrgTable
      model={model}
      selectedId={selectedId}
      onSelect={onSelect}
      revealRequest={revealRequest}
    />
  );
}

export function OrgDashboardPage() {
  const model = useOrgDashboardModel();
  const { expansion } = model;

  return (
    <>
      <Header>
        <Title>Оргструктура</Title>
        <ViewSwitcher views={model.views} value={model.view} onChange={model.setView} />
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
            <TablePane
              params={model.params}
              onParamsChange={model.setParams}
              selectedId={model.selectedId}
              onSelect={model.selectFromTable}
              revealRequest={model.tableReveal}
            />
          </Pane>
        )}
      </Panes>
    </>
  );
}
