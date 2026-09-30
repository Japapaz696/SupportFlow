import { useCallback, useEffect, useState } from 'react';
import type { TicketListItem } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { ApiError, listTickets } from '../services/api';
import { CreateTicketForm } from './CreateTicketForm';
import { TicketDetailPage } from './TicketDetailPage';

type Props = {
  initialSelectedTicketId?: string | null;
};

export function TicketsPage({ initialSelectedTicketId = null }: Props) {
  const { token, user } = useAuth();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialSelectedTicketId);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const result = await listTickets(token, { page, pageSize: 10, status, priority });
      setTickets(result.items);
      setTotal(result.total);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível carregar os chamados.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, priority, status, token]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  if (!token || !user) return null;

  if (selectedTicketId) {
    return (
      <TicketDetailPage
        id={selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
        onChanged={loadTickets}
      />
    );
  }

  if (showCreate) {
    return (
      <CreateTicketForm
        token={token}
        onCancel={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false);
          setSelectedTicketId(id);
        }}
      />
    );
  }

  const canCreate =
    user.role === 'requester' ||
    user.role === 'agent' ||
    user.role === 'manager' ||
    user.role === 'admin';
  const hasNextPage = page * 10 < total;

  return (
    <section className="tickets-page" aria-labelledby="tickets-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Atendimento</p>
          <h1 id="tickets-title">Chamados</h1>
        </div>
        {canCreate ? (
          <button type="button" onClick={() => setShowCreate(true)}>
            Novo chamado
          </button>
        ) : null}
      </div>

      <div className="filters" aria-label="Filtros de chamados">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="open">Aberto</option>
            <option value="in_progress">Em atendimento</option>
            <option value="waiting_requester">Aguardando solicitante</option>
            <option value="resolved">Resolvido</option>
            <option value="closed">Fechado</option>
          </select>
        </label>
        <label>
          Prioridade
          <select
            value={priority}
            onChange={(event) => {
              setPage(1);
              setPriority(event.target.value);
            }}
          >
            <option value="">Todas</option>
            <option value="critical">Crítica</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
        </label>
      </div>

      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {isLoading ? <p role="status">Carregando chamados…</p> : null}
      {!isLoading && tickets.length === 0 ? (
        <p className="empty-state">Nenhum chamado encontrado.</p>
      ) : null}
      <ul className="ticket-list">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <button
              className="ticket-card"
              type="button"
              onClick={() => setSelectedTicketId(ticket.id)}
            >
              <span className="ticket-code">{ticket.code}</span>
              <strong>{ticket.title}</strong>
              <span>
                {ticket.category.name} · {ticket.status} · {ticket.priority}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="pagination">
        <button
          type="button"
          disabled={page === 1 || isLoading}
          onClick={() => setPage((current) => current - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          type="button"
          disabled={!hasNextPage || isLoading}
          onClick={() => setPage((current) => current + 1)}
        >
          Próxima
        </button>
      </div>
    </section>
  );
}
