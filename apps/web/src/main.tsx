import { startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const root = createRoot(rootElement);
// Без StrictMode: решение пользователя, двойные эффекты в dev давали лишний (отменённый)
// запрос. Первый рендер в transition: React рендерит квантами и не держит главный поток
// одной длинной задачей.
startTransition(() => {
  root.render(<App />);
});
