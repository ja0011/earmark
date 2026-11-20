import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { WalletProvider } from './lib/wallet';
import { Toasts } from './components/Toasts';
import Landing from './pages/Landing';

const Send = lazy(() => import('./pages/Send'));
const GiftPage = lazy(() => import('./pages/Gift'));
const Gifts = lazy(() => import('./pages/Gifts'));
const Pay = lazy(() => import('./pages/Pay'));
const Stores = lazy(() => import('./pages/Stores'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Shell() {
  const loc = useLocation();
  return (
    <>
      <Suspense fallback={<div className="min-h-dvh bg-receipt" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/send" element={<Send />} />
          <Route path="/gift/:id" element={<GiftPage />} />
          <Route path="/gifts" element={<Gifts />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {loc.pathname !== '/pay' && <Toasts />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <Shell />
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
