import { useEffect, useRef } from 'react';
import { TABLE_QUERY_DEBOUNCE_MS } from './useTableModel';
import type { StructuredFilter } from './structuredFilter';

export interface ParseResult {
  mode: 'structured' | 'text';
  filter: StructuredFilter;
  explanation: string;
  query: string;
}

export interface UseSearchParseOptions {
  query: string;
  hasParsedQuery: boolean;
  onParseResult: (result: ParseResult) => void;
}

export interface SearchParseModel {
  isParsing: boolean;
}

async function fetchParse(query: string, signal: AbortSignal): Promise<ParseResult> {
  const response = await fetch('/api/search/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Сервер ответил ошибкой ${response.status}`);
  }

  const data = await response.json();

  return {
    mode: data.mode,
    filter: data.filter ?? {},
    explanation: data.explanation ?? '',
    query,
  };
}

export function useSearchParse({
  query,
  hasParsedQuery,
  onParseResult,
}: UseSearchParseOptions): SearchParseModel {
  const controllerRef = useRef<AbortController | null>(null);

  const shouldParse = query.trim().length > 0 && !hasParsedQuery;

  useEffect(() => {
    if (!shouldParse) {
      return;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const timer = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;

      fetchParse(query, controller.signal)
        .then(onParseResult)
        .catch((error) => {
          if (error.name === 'AbortError') return;
          onParseResult({ mode: 'text', filter: {}, explanation: '', query });
        });
    }, TABLE_QUERY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [shouldParse, query, onParseResult]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { isParsing: shouldParse };
}
