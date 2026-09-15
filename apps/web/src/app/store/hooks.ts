import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

// Только для кода @app/web. Пакеты работают со стором через публичные хуки @entities/*.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
