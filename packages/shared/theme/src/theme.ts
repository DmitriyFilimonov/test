// Type-only импорт вводит styled-components в программу, иначе аугментация ниже
// не находит модуль (TS2664) при изолированной типизации пакета.
import type {} from 'styled-components';

/** Диапазоны performance, от худшего к лучшему. */
export const PERFORMANCE_LEVELS = ['critical', 'low', 'mid', 'high', 'top'] as const;
export type PerformanceLevel = (typeof PERFORMANCE_LEVELS)[number];

export interface AppTheme {
  fonts: {
    /** Системный стек: веб-шрифты не грузятся и не блокируют первую отрисовку. */
    body: string;
  };
  colors: {
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    primary: string;
    border: string;
    focus: string;
    edge: string;
    skeleton: string;
    danger: string;
    performance: Record<PerformanceLevel, string>;
    /** Индикатор, когда performance не определён (в подразделении 0 человек). */
    performanceNone: string;
  };
  performance: {
    /**
     * Нижняя граница каждого диапазона, кроме critical (он начинается с 0).
     * Значение попадает в самый высокий диапазон, чью границу оно достигло.
     */
    thresholds: Record<Exclude<PerformanceLevel, 'critical'>, number>;
  };
  tree: {
    /** Размер узла одинаков для всех уровней и не измеряется из DOM. */
    nodeSize: { width: number; height: number };
    siblingGap: number;
    subtreeGap: number;
    levelGap: number;
    /** Высота холста одинакова во всех состояниях: скелетон, ошибка, дерево. */
    canvasHeight: string;
    minZoom: number;
    maxZoom: number;
  };
  fontSizes: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  space: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
  };
  radii: {
    sm: string;
    md: string;
  };
}

export const theme: AppTheme = {
  fonts: {
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  colors: {
    background: '#ffffff',
    surface: '#f6f8fa',
    text: '#1f2328',
    textMuted: '#59636e',
    primary: '#0969da',
    border: '#d1d9e0',
    focus: '#0969da',
    edge: '#8c959f',
    skeleton: '#eaeef2',
    danger: '#cf222e',
    performance: {
      critical: '#cf222e',
      low: '#e16f24',
      mid: '#bf8700',
      high: '#2da44e',
      top: '#116329',
    },
    performanceNone: '#afb8c1',
  },
  performance: {
    thresholds: { low: 40, mid: 60, high: 75, top: 90 },
  },
  tree: {
    nodeSize: { width: 256, height: 136 },
    siblingGap: 16,
    subtreeGap: 40,
    levelGap: 56,
    canvasHeight: 'clamp(420px, 70vh, 760px)',
    minZoom: 0.25,
    maxZoom: 2,
  },
  fontSizes: {
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '24px',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
  },
  radii: {
    sm: '4px',
    md: '8px',
  },
};

/** Диапазон performance по порогам темы: самый высокий, чью нижнюю границу значение достигло. */
export function getPerformanceLevel(
  value: number,
  thresholds: AppTheme['performance']['thresholds'] = theme.performance.thresholds,
): PerformanceLevel {
  if (value >= thresholds.top) return 'top';
  if (value >= thresholds.high) return 'high';
  if (value >= thresholds.mid) return 'mid';
  if (value >= thresholds.low) return 'low';
  return 'critical';
}

// Аугментация лежит в том же модуле, что и тип: любой импорт из @shared/theme
// (включая `import type`) подтягивает её в программу потребителя.
declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- интерфейс нужен для declaration merging
  export interface DefaultTheme extends AppTheme {}
}
