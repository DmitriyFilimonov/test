import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Без globals vitest Testing Library не находит afterEach и сама не размонтирует деревья
// между тестами.
afterEach(cleanup);
