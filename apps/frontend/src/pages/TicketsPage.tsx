import { useCallback, useEffect, useRef, useState } from 'react';
import type { TicketListItem } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { ApiError, listTickets } from '../services/api';
import {
  formatTicketPriority,
  formatTicketStatus,
  priorityBadgeClass,
  statusBadgeClass,
} from '../ui/labels';
import { CreateTicketForm } from './CreateTicketForm';
import { TicketDetailPage } from './TicketDetailPage';

type Props = {
  initialSelectedTicketId?: string | null;
};

const PAGE_SIZE = 10;

function TicketsTableSkeleton() {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--block" />
      <div className="skeleton skeleton--text" />
    </div>
  );
}

export function TicketsPage({ initialSelectedTicketId = null }: Props) {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialSelectedTicketId);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const errorRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const result = await listTickets(token, {
        page,
        pageSize: PAGE_SIZE,
        status,
        priority,
        search: appliedSearch,
      });
      setTickets(result.items);
      setTotal(result.total);
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível carregar os chamados.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, page, priority, showToast, status, token]);

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
          showToast('success', 'Chamado criado com sucesso.');
        }}
      />
    );
  }

  const canCreate =
    user.role === 'requester' ||
    user.role === 'agent' ||
    user.role === 'manager' ||
    user.role === 'admin';
  const hasNextPage = page * PAGE_SIZE < total;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(status || priority || appliedSearch);

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  function clearFilters() {
    setStatus('');
    setPriority('');
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  }

  return (
    <section className="tickets-page" aria-labelledby="tickets-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Atendimento</p>
          <h1 id="tickets-title">Chamados</h1>
          <p className="supporting-text">Acompanhe, filtre e abra chamados no seu escopo.</p>
        </div>
        {canCreate ? (
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            Novo chamado
          </button>
        ) : null}
      </div>

      <div className="filters" aria-label="Filtros de chamados">
        <form className="filters-search" onSubmit={applySearch} role="search">
          <label htmlFor="ticket-search">Buscar</label>
          <input
            id="ticket-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, título ou descrição"
            maxLength={120}
          />
          <button className="secondary-button" type="submit">
            Buscar
          </button>
        </form>
        <label htmlFor="ticket-filter-status">
          Status
          <select
            id="ticket-filter-status"
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
            <option value="cancelled">Cancelado</option>
          </select>
        </label>
        <label htmlFor="ticket-filter-priority">
          Prioridade
          <select
            id="ticket-filter-priority"
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
        {hasFilters ? (
          <button className="secondary-button" type="button" onClick={clearFilters}>
            Limpar filtros
          </button>
        ) : null}
      </div>

      {message ? (
        <div className="form-error" role="alert" ref={errorRef} tabIndex={-1}>
          <p>{message}</p>
          <button className="secondary-button" type="button" onClick={() => void loadTickets()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {isLoading ? <TicketsTableSkeleton /> : null}

      {!isLoading && !message && tickets.length === 0 ? (
        <div className="empty-state-box">
          <h3>{hasFilters ? 'Nenhum resultado encontrado' : 'Nenhum chamado ainda'}</h3>
          <p className="supporting-text">
            {hasFilters
              ? 'Ajuste os filtros ou limpe a busca para ver outros chamados.'
              : 'Quando houver chamados, eles aparecem aqui com status, prioridade e responsável.'}
          </p>
          <div className="form-actions">
            {hasFilters ? (
              <button className="secondary-button" type="button" onClick={clearFilters}>
                Limpar busca e filtros
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
              Abrir chamado
            </button>
          </div>
        </div>
      ) : null}

      {!isLoading && tickets.length > 0 ? (
        <>
          {/* Tabela estruturada (desktop). */}
          <table className="ticket-table">
            <caption className="visually-hidden">
              Lista de chamados ({total} {total === 1 ? 'registro' : 'registros'})
            </caption>
            <thead>
              <tr>
                <th scope="col">Chamado</th>
                <th scope="col">Título</th>
                <th scope="col">Categoria</th>
                <th scope="col">Status</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                    >
                      <span className="ticket-code">{ticket.code}</span>
                    </button>
                  </td>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                    >
                      {ticket.title}
                    </button>
                  </td>
                  <td>{ticket.category.name}</td>
                  <td>
                    <span className={statusBadgeClass(ticket.status)}>
                      {formatTicketStatus(ticket.status)}
                    </span>
                  </td>
                  <td>
                    <span className={priorityBadgeClass(ticket.priority)}>
                      {formatTicketPriority(ticket.priority)}
                    </span>
                  </td>
                  <td>{ticket.assignee?.name ?? 'Sem responsável'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cartoes (celular). */}
          <ul className="ticket-list ticket-cards-mobile">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  className="ticket-card"
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <span className="ticket-code">{ticket.code}</span>
                  <strong>{ticket.title}</strong>
                  <span className="ticket-card-meta">
                    <span>{ticket.category.name}</span>
                    <span className={statusBadgeClass(ticket.status)}>
                      {formatTicketStatus(ticket.status)}
                    </span>
                    <span className={priorityBadgeClass(ticket.priority)}>
                      {formatTicketPriority(ticket.priority)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="pagination">
        <button
          type="button"
          className="secondary-button"
          disabled={page === 1 || isLoading}
          onClick={() => setPage((current) => current - 1)}
        >
          ← Anterior
        </button>
        <span>
          Página {page} de {pageCount} · {total} {total === 1 ? 'chamado' : 'chamados'}
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={!hasNextPage || isLoading}
          onClick={() => setPage((current) => current + 1)}
        >
          Próxima →
        </button>
      </div>
    </section>
  );
}
