import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element not found');
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (count, error) => count < 1 && (!(error instanceof ApiError) || error.error.retryable), staleTime: 2000 } } });

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
