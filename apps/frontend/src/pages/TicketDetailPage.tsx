import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  CommentVisibility,
  TicketDetail,
  TicketPriority,
  TicketStatus,
} from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import {
  addComment,
  ApiError,
  assignTicket,
  changeTicketPriority,
  changeTicketStatus,
  getTicket,
} from '../services/api';
import {
  formatCommentVisibility,
  formatSlaClockStatus,
  formatTicketEvent,
  formatTicketPriority,
  formatTicketStatus,
  priorityBadgeClass,
  statusBadgeClass,
} from '../ui/labels';
import { TicketTechnicalDiagnosticPanel } from './TicketTechnicalDiagnosticPanel';

type Props = {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  createdNotice?: boolean;
};

function formatSlaClock(label: string, clock: TicketDetail['sla']['firstResponse']) {
  const due = clock.dueAt ? new Date(clock.dueAt).toLocaleString('pt-BR') : 'Não configurado';
  const time =
    clock.status === 'met'
      ? ''
      : clock.remainingMinutes === null
        ? ''
        : clock.status === 'breached'
          ? ` · vencido há ${clock.remainingMinutes} min`
          : ` · ${clock.remainingMinutes} min restantes`;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        Prazo: {due} · Status: {formatSlaClockStatus(clock.status)}
        {time}
      </dd>
    </div>
  );
}

const statusTransitions: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress'],
  in_progress: ['waiting_requester', 'resolved'],
  waiting_requester: ['in_progress'],
  resolved: ['in_progress', 'closed'],
  closed: [],
  cancelled: [],
};

export function TicketDetailPage({ id, onBack, onChanged, createdNotice = false }: Props) {
  const { token, user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [message, setMessage] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('public');
  const [assigneeId, setAssigneeId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(
    createdNotice ? 'Chamado criado com sucesso!' : '',
  );

  const loadTicket = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const result = await getTicket(token, id);
      setTicket(result);
      setAssigneeId(result.assignee?.id ?? '');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível carregar o chamado.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    setTicket(null);
    setSuccessMessage(createdNotice ? 'Chamado criado com sucesso!' : '');
    void loadTicket();
  }, [createdNotice, loadTicket]);

  if (!token || !user) return null;
  const isTeam = user.role === 'agent' || user.role === 'manager' || user.role === 'admin';
  const canManagePriority = user.role === 'manager' || user.role === 'admin';
  const isMutable = ticket?.status !== 'closed' && ticket?.status !== 'cancelled';
  const availableStatuses = ticket
    ? [
        ticket.status,
        ...statusTransitions[ticket.status],
        ...(canManagePriority && !['closed', 'cancelled'].includes(ticket.status)
          ? (['cancelled'] as TicketStatus[])
          : []),
      ]
    : [];

  async function runAction(action: () => Promise<TicketDetail>) {
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      setTicket(await action());
      setSuccessMessage('Chamado atualizado com sucesso!');
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível executar a ação.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      if (!token) return;
      await addComment(token, id, { body: commentBody, visibility });
      setCommentBody('');
      setVisibility('public');
      setSuccessMessage('Comentário criado com sucesso!');
      await loadTicket();
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível comentar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="ticket-detail" aria-labelledby="ticket-detail-title">
      <button type="button" className="secondary-button" onClick={onBack}>
        Voltar
      </button>
      {message ? (
        <div className="form-error" role="alert">
          <p>{message}</p>
          {!ticket ? (
            <button className="secondary-button" type="button" onClick={() => void loadTicket()}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}
      {isLoading ? (
        <p className="status-message" role="status">
          Carregando chamado…
        </p>
      ) : null}
      {successMessage ? (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      ) : null}
      {ticket ? (
        <>
          <div className="page-header">
            <div>
              <p className="eyebrow">{ticket.code}</p>
              <h1 id="ticket-detail-title">{ticket.title}</h1>
            </div>
            <span className={statusBadgeClass(ticket.status)}>
              {formatTicketStatus(ticket.status)}
            </span>
          </div>
          <p className="supporting-text">{ticket.description}</p>
          <dl className="user-details">
            {formatSlaClock('Primeira resposta', ticket.sla.firstResponse)}
            {formatSlaClock('Resolução', ticket.sla.resolution)}
            <div>
              <dt>Categoria</dt>
              <dd>{ticket.category.name}</dd>
            </div>
            <div>
              <dt>Prioridade</dt>
              <dd>
                <span className={priorityBadgeClass(ticket.priority)}>
                  {formatTicketPriority(ticket.priority)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Solicitante</dt>
              <dd>{ticket.requester.name}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{ticket.assignee?.name ?? 'Sem responsável'}</dd>
            </div>
          </dl>

          {isTeam ? (
            <TicketTechnicalDiagnosticPanel
              ticketId={id}
              isMutable={Boolean(isMutable)}
              onUpdated={loadTicket}
            />
          ) : null}

          {isTeam && isMutable ? (
            <div className="action-panel">
              <label htmlFor="ticket-status">
                Status
                <select
                  id="ticket-status"
                  value={ticket.status}
                  onChange={(event) =>
                    token &&
                    void runAction(() =>
                      changeTicketStatus(token, id, event.target.value as TicketStatus),
                    )
                  }
                  disabled={isSubmitting}
                >
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatTicketStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
              {canManagePriority ? (
                <label htmlFor="ticket-priority">
                  Prioridade
                  <select
                    id="ticket-priority"
                    value={ticket.priority}
                    onChange={(event) =>
                      token &&
                      void runAction(() =>
                        changeTicketPriority(token, id, event.target.value as TicketPriority),
                      )
                    }
                    disabled={isSubmitting}
                  >
                    <option value="critical">{formatTicketPriority('critical')}</option>
                    <option value="high">{formatTicketPriority('high')}</option>
                    <option value="medium">{formatTicketPriority('medium')}</option>
                    <option value="low">{formatTicketPriority('low')}</option>
                  </select>
                </label>
              ) : null}
              {canManagePriority ? (
                <>
                  <label htmlFor="ticket-assignee">
                    ID do responsável
                    <input
                      id="ticket-assignee"
                      value={assigneeId}
                      onChange={(event) => setAssigneeId(event.target.value)}
                      placeholder="UUID do agente"
                      disabled={isSubmitting}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() =>
                      token && void runAction(() => assignTicket(token, id, assigneeId || null))
                    }
                  >
                    Atualizar responsável
                  </button>
                </>
              ) : null}
              {user.role === 'agent' && (!ticket.assignee || ticket.assignee.id === user.id) ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => token && void runAction(() => assignTicket(token, id, user.id))}
                >
                  Assumir para mim
                </button>
              ) : null}
            </div>
          ) : null}

          <section aria-labelledby="comments-title">
            <h2 id="comments-title">Comentários</h2>
            {ticket.comments.length === 0 ? (
              <p className="empty-state">Nenhum comentário ainda.</p>
            ) : (
              <ul className="comment-list">
                {ticket.comments.map((comment) => (
                  <li key={comment.id}>
                    <strong>{comment.author.name}</strong>
                    <span
                      className={comment.visibility === 'internal' ? 'badge badge--neutral' : ''}
                    >
                      {formatCommentVisibility(comment.visibility)}
                    </span>
                    <p>{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {isMutable ? (
              <form className="login-form" onSubmit={submitComment}>
                <label htmlFor="comment-body">Novo comentário</label>
                <textarea
                  id="comment-body"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  rows={4}
                  required
                  disabled={isSubmitting}
                />
                {isTeam ? (
                  <label htmlFor="comment-visibility">
                    Visibilidade
                    <select
                      id="comment-visibility"
                      value={visibility}
                      onChange={(event) => setVisibility(event.target.value as CommentVisibility)}
                      disabled={isSubmitting}
                    >
                      <option value="public">{formatCommentVisibility('public')}</option>
                      <option value="internal">{formatCommentVisibility('internal')}</option>
                    </select>
                  </label>
                ) : null}
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando…' : 'Comentar'}
                </button>
              </form>
            ) : null}
          </section>

          {isTeam ? (
            <section aria-labelledby="events-title">
              <h2 id="events-title">Histórico</h2>
              {ticket.events.length === 0 ? (
                <p className="empty-state">Nenhum evento registrado.</p>
              ) : (
                <ul className="comment-list">
                  {ticket.events.map((event) => (
                    <li key={event.id}>
                      <span className="badge badge--neutral">{formatTicketEvent(event.type)}</span>
                      <span> · </span>
                      <span>{event.actor?.name ?? 'Sistema'}</span>
                      <span> · </span>
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString('pt-BR')}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
