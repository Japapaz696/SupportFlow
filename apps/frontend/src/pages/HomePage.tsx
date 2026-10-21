import { useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { formatUserRole } from '../ui/labels';
import { CategoriesAdminPage } from './CategoriesAdminPage';
import { DashboardPage } from './DashboardPage';
import { NotificationBell, NotificationsPanel } from './NotificationsPanel';
import { SlaPoliciesPage } from './SlaPoliciesPage';
import { TicketsPage } from './TicketsPage';

type View = 'categories' | 'dashboard' | 'notifications' | 'sla-policies' | 'tickets';

export function HomePage() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const isTeam = user.role !== 'requester';
  const canManageSettings = user.role === 'manager' || user.role === 'admin';
  const activeView =
    !isTeam && (view === 'dashboard' || view === 'sla-policies' || view === 'categories')
      ? 'tickets'
      : view;

  function openTickets(id: string | null = null) {
    setSelectedTicketId(id);
    setView('tickets');
    setSidebarOpen(false);
  }

  function navigate(v: View) {
    setView(v);
    setSidebarOpen(false);
  }

  return (
    <div className="app-layout">
      {sidebarOpen ? (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      ) : null}
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">SupportFlow</div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {isTeam ? (
            <button
              className={activeView === 'dashboard' ? 'nav-active' : ''}
              type="button"
              aria-current={activeView === 'dashboard' ? 'page' : undefined}
              onClick={() => navigate('dashboard')}
            >
              📊 Dashboard
            </button>
          ) : null}
          <button
            className={activeView === 'tickets' ? 'nav-active' : ''}
            type="button"
            aria-current={activeView === 'tickets' ? 'page' : undefined}
            onClick={() => openTickets(null)}
          >
            📋 Chamados
          </button>
          {canManageSettings ? (
            <>
              <button
                className={activeView === 'sla-policies' ? 'nav-active' : ''}
                type="button"
                aria-current={activeView === 'sla-policies' ? 'page' : undefined}
                onClick={() => navigate('sla-policies')}
              >
                ⏱ Políticas SLA
              </button>
              <button
                className={activeView === 'categories' ? 'nav-active' : ''}
                type="button"
                aria-current={activeView === 'categories' ? 'page' : undefined}
                onClick={() => navigate('categories')}
              >
                📁 Categorias
              </button>
            </>
          ) : null}
          <button
            className={activeView === 'notifications' ? 'nav-active' : ''}
            type="button"
            aria-current={activeView === 'notifications' ? 'page' : undefined}
            onClick={() => navigate('notifications')}
          >
            🔔 Notificações
          </button>
        </nav>
        <div style={{ marginTop: 'auto', padding: '0.5rem' }}>
          <p className="supporting-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            {user.name}
          </p>
          <p className="supporting-text" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            {formatUserRole(user.role)}
          </p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void logout()}
            style={{ width: '100%' }}
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="page-header">
          <div>
            <p className="eyebrow">SupportFlow</p>
            <h1 id="page-title">
              {activeView === 'dashboard'
                ? 'Dashboard'
                : activeView === 'tickets'
                  ? 'Chamados'
                  : activeView === 'notifications'
                    ? 'Notificações'
                    : activeView === 'sla-policies'
                      ? 'Políticas SLA'
                      : activeView === 'categories'
                        ? 'Categorias'
                        : 'SupportFlow'}
            </h1>
          </div>
          <NotificationBell onOpen={() => navigate('notifications')} />
        </div>
        {activeView === 'dashboard' ? <DashboardPage onOpenTicket={openTickets} /> : null}
        {activeView === 'tickets' ? (
          <TicketsPage initialSelectedTicketId={selectedTicketId} />
        ) : null}
        {activeView === 'notifications' ? <NotificationsPanel onOpenTicket={openTickets} /> : null}
        {activeView === 'sla-policies' && canManageSettings ? <SlaPoliciesPage /> : null}
        {activeView === 'categories' && canManageSettings ? <CategoriesAdminPage /> : null}
      </main>
    </div>
  );
}
