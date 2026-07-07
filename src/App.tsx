import React from 'react';
import { AppProvider } from './context/AppContext';
import { AppRouter } from './router/AppRouter';
import { Toaster } from 'sonner';

function App() {
  return (
    <AppProvider>
      <AppRouter />
      <Toaster richColors position="top-right" theme="dark" />
    </AppProvider>
  );
}

export default App;
