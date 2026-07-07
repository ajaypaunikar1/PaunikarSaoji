import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppRouter } from './router/AppRouter';
import { Toaster, toast } from 'sonner';

function FullscreenWrapper() {
  const { language } = useApp();

  useEffect(() => {
    // 1. Request fullscreen on first user interaction
    const enterFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
          .then(() => {
            // Push history state to capture back navigation
            window.history.pushState({ fullscreen: true }, '');
          })
          .catch(() => {});
      }
      document.removeEventListener('click', enterFullscreen);
      document.removeEventListener('touchstart', enterFullscreen);
    };

    document.addEventListener('click', enterFullscreen);
    document.addEventListener('touchstart', enterFullscreen);

    // 2. Double back press popstate listener
    let backPressCount = 0;
    let lastPressTime = 0;

    const handlePopState = () => {
      if (document.fullscreenElement) {
        const now = Date.now();
        if (now - lastPressTime < 2000) {
          backPressCount++;
        } else {
          backPressCount = 1;
        }
        lastPressTime = now;

        if (backPressCount >= 2) {
          // Exit Full Screen
          document.exitFullscreen().catch(() => {});
          backPressCount = 0;
        } else {
          // Push state again to prevent page navigation
          window.history.pushState({ fullscreen: true }, '');
          toast.info(
            language === 'en' 
              ? 'Click back once more to exit Full Screen mode' 
              : 'पूर्ण स्क्रीनमधून बाहेर पडण्यासाठी पुन्हा एकदा मागे क्लिक करा'
          );
        }
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', enterFullscreen);
      document.removeEventListener('touchstart', enterFullscreen);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [language]);

  return null;
}

function App() {
  return (
    <AppProvider>
      <FullscreenWrapper />
      <AppRouter />
      <Toaster richColors position="top-right" theme="dark" />
    </AppProvider>
  );
}

export default App;
