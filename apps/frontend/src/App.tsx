import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
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
    <AuthProvider>
      <AppShell>
        <AuthenticatedApp />
      </AppShell>
    </AuthProvider>
  );
}

export default App;
