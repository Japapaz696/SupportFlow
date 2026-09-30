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
  }

  return (
    <section className="home-page wide" aria-labelledby="page-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">SupportFlow</p>
          <h1 id="page-title">Olá, {user.name}</h1>
          <p className="supporting-text">Perfil: {formatUserRole(user.role)}</p>
        </div>
        <div className="header-actions">
          <NotificationBell onOpen={() => setView('notifications')} />
          <button className="secondary-button" type="button" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </div>
      <nav className="app-nav" aria-label="Navegação principal">
        {isTeam ? (
          <button
            className={activeView === 'dashboard' ? 'nav-active' : ''}
            type="button"
            aria-current={activeView === 'dashboard' ? 'page' : undefined}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
        ) : null}
        <button
          className={activeView === 'tickets' ? 'nav-active' : ''}
          type="button"
          aria-current={activeView === 'tickets' ? 'page' : undefined}
          onClick={() => openTickets(null)}
        >
          Chamados
        </button>
        {canManageSettings ? (
          <>
            <button
              className={activeView === 'sla-policies' ? 'nav-active' : ''}
              type="button"
              aria-current={activeView === 'sla-policies' ? 'page' : undefined}
              onClick={() => setView('sla-policies')}
            >
              Políticas SLA
            </button>
            <button
              className={activeView === 'categories' ? 'nav-active' : ''}
              type="button"
              aria-current={activeView === 'categories' ? 'page' : undefined}
              onClick={() => setView('categories')}
            >
              Categorias
            </button>
          </>
        ) : null}
      </nav>
      {activeView === 'dashboard' ? <DashboardPage onOpenTicket={openTickets} /> : null}
      {activeView === 'tickets' ? <TicketsPage initialSelectedTicketId={selectedTicketId} /> : null}
      {activeView === 'notifications' ? <NotificationsPanel onOpenTicket={openTickets} /> : null}
      {activeView === 'sla-policies' && canManageSettings ? <SlaPoliciesPage /> : null}
      {activeView === 'categories' && canManageSettings ? <CategoriesAdminPage /> : null}
    </section>
  );
}
