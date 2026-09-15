import { useId } from 'react';
import styled from 'styled-components';
import type { OrgDashboardView } from '../model/searchParams';

const VIEW_LABELS: Record<OrgDashboardView, string> = {
  tree: 'Дерево',
  table: 'Таблица',
  split: 'Дерево и таблица',
};

const Group = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
`;

const Option = styled.label`
  position: relative;
  display: flex;

  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

/* Сам input скрыт визуально, но остаётся в дереве доступности и в порядке фокуса. */
const Input = styled.input`
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
`;

const Label = styled.span`
  padding: ${({ theme }) => `${theme.space.xs} ${theme.space.md}`};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;

  input:checked + & {
    background: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.background};
  }

  input:focus-visible + & {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: -4px;
  }
`;

export interface ViewSwitcherProps {
  views: readonly OrgDashboardView[];
  value: OrgDashboardView;
  onChange: (view: OrgDashboardView) => void;
}

/**
 * Переключатель режима — группа радиокнопок: выбор одного значения настройки. Нативные input
 * дают Tab на группу и стрелки внутри без своего кода. split — последний: когда он пропадает на
 * узком экране, остальные кнопки не сдвигаются.
 */
export function ViewSwitcher({ views, value, onChange }: ViewSwitcherProps) {
  const name = useId();
  return (
    <Group role="radiogroup" aria-label="Представление">
      {views.map((view) => (
        <Option key={view}>
          <Input
            type="radio"
            name={name}
            value={view}
            checked={view === value}
            onChange={() => onChange(view)}
          />
          <Label>{VIEW_LABELS[view]}</Label>
        </Option>
      ))}
    </Group>
  );
}
