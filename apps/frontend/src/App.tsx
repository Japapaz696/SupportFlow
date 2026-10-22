import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p role="status">Validando sessão…</p>;
  }

  return user ? <HomePage /> : <LoginPage />;
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppShell>
            <AuthenticatedApp />
          </AppShell>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
