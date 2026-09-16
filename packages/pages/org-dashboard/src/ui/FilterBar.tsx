import { memo } from 'react';
import styled from 'styled-components';
import type { StructuredFilter } from '@entities/org-tree';

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  padding: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.sm};
  margin-bottom: ${({ theme }) => theme.space.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Explanation = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Condition = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  padding: 0 ${({ theme }) => theme.space.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.background};
`;

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;
  font-size: 12px;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.danger};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: 1px;
  }
`;

const ActionButton = styled.button`
  padding: 0 ${({ theme }) => theme.space.xs};
  border: none;
  background: none;
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;
  font: inherit;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: 1px;
  }
`;

const Separator = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
`;

interface FilterBarProps {
  explanation: string;
  filter: StructuredFilter;
  onRemoveCondition: (key: keyof StructuredFilter) => void;
  onSearchByText: () => void;
  onClear: () => void;
}

function conditionLabel(key: keyof StructuredFilter, filter: StructuredFilter): string {
  switch (key) {
    case 'levels': {
      const names: Record<number, string> = { 1: 'дивизионы', 2: 'отделы', 3: 'команды' };
      return (filter.levels ?? []).map((l) => names[l]).join(', ');
    }
    case 'minHeadcount':
      return filter.maxHeadcount != null
        ? `численность ${filter.minHeadcount}–${filter.maxHeadcount}`
        : `численность от ${filter.minHeadcount}`;
    case 'maxHeadcount':
      return filter.minHeadcount != null
        ? `численность ${filter.minHeadcount}–${filter.maxHeadcount}`
        : `численность до ${filter.maxHeadcount}`;
    case 'minBudget':
      return filter.maxBudget != null
        ? `бюджет ${filter.minBudget}–${filter.maxBudget}`
        : `бюджет от ${filter.minBudget}`;
    case 'maxBudget':
      return filter.minBudget != null
        ? `бюджет ${filter.minBudget}–${filter.maxBudget}`
        : `бюджет до ${filter.maxBudget}`;
    case 'minPerformance':
      return filter.maxPerformance != null
        ? `эффективность ${filter.minPerformance}–${filter.maxPerformance}%`
        : `эффективность от ${filter.minPerformance}%`;
    case 'maxPerformance':
      return filter.minPerformance != null
        ? `эффективность ${filter.minPerformance}–${filter.maxPerformance}%`
        : `эффективность до ${filter.maxPerformance}%`;
  }
}

export const FilterBar = memo(function FilterBar({
  explanation,
  filter,
  onRemoveCondition,
  onSearchByText,
  onClear,
}: FilterBarProps) {
  const conditions: (keyof StructuredFilter)[] = [];
  if ((filter.levels ?? []).length > 0) conditions.push('levels');
  if (filter.minHeadcount != null || filter.maxHeadcount != null) {
    conditions.push(filter.minHeadcount != null ? 'minHeadcount' : 'maxHeadcount');
  }
  if (filter.minBudget != null || filter.maxBudget != null) {
    conditions.push(filter.minBudget != null ? 'minBudget' : 'maxBudget');
  }
  if (filter.minPerformance != null || filter.maxPerformance != null) {
    conditions.push(filter.minPerformance != null ? 'minPerformance' : 'maxPerformance');
  }

  return (
    <Bar>
      <Explanation>{explanation}</Explanation>
      {conditions.map((key) => (
        <Condition key={key}>
          {conditionLabel(key, filter)}
          <RemoveButton
            type="button"
            aria-label={`Удалить условие: ${conditionLabel(key, filter)}`}
            onClick={() => onRemoveCondition(key)}
          >
            ×
          </RemoveButton>
        </Condition>
      ))}
      <Separator>·</Separator>
      <ActionButton type="button" onClick={onSearchByText}>
        Искать по тексту
      </ActionButton>
      <ActionButton type="button" onClick={onClear}>
        Сбросить
      </ActionButton>
    </Bar>
  );
});
