import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { WalletProvider } from './lib/wallet';
import { EnglishOnly, LanguageProvider } from './lib/i18n';
import { AutoTranslate } from './lib/autoTranslate';
import { Toasts } from './components/Toasts';
import Landing from './pages/Landing';

const Send = lazy(() => import('./pages/Send'));
const GiftPage = lazy(() => import('./pages/Gift'));
const Profile = lazy(() => import('./pages/Profile'));
const Pay = lazy(() => import('./pages/Pay'));
const Stores = lazy(() => import('./pages/Stores'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Shell() {
  const loc = useLocation();
  return (
    <>
      <Suspense fallback={<div className="min-h-dvh bg-receipt" />}>
        <Routes>
          <Route path="/" element={<EnglishOnly><AutoTranslate><Landing /></AutoTranslate></EnglishOnly>} />
          <Route path="/send" element={<EnglishOnly><AutoTranslate><Send /></AutoTranslate></EnglishOnly>} />
          <Route path="/gift/:id" element={<GiftPage />} />
          <Route path="/me" element={<Profile />} />
          <Route path="/gifts" element={<Navigate to="/me" replace />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/stores" element={<EnglishOnly><AutoTranslate><Stores /></AutoTranslate></EnglishOnly>} />
          <Route path="*" element={<EnglishOnly><AutoTranslate><NotFound /></AutoTranslate></EnglishOnly>} />
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
        <LanguageProvider>
          <Shell />
        </LanguageProvider>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
