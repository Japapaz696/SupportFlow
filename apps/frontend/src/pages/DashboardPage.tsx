import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary, TicketPriority } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { ApiError, getDashboardSummary } from '../services/api';
import {
  formatTicketPriority,
  formatTicketStatus,
  priorityBadgeClass,
  statusBadgeClass,
} from '../ui/labels';

type Props = {
  onOpenTicket: (id: string) => void;
};

const labels = {
  open: 'Abertos',
  inProgress: 'Em andamento',
  waitingRequester: 'Aguardando solicitante',
  resolved: 'Resolvidos',
  closed: 'Fechados',
  unassigned: 'Sem responsável',
} as const;

function percent(value: number | null): string {
  return value === null ? 'Sem dados' : `${Math.round(value * 100)}%`;
}

function minutes(value: number | null): string {
  return value === null ? 'Sem dados' : `${Math.round(value)} min`;
}

export function DashboardPage({ onOpenTicket }: Props) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      setSummary(await getDashboardSummary(token));
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível carregar o dashboard.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <p className="status-message" role="status">
        Carregando dashboard…
      </p>
    );
  }
  if (message) {
    return (
      <section className="dashboard-page" aria-label="Erro do dashboard">
        <p className="form-error" role="alert">
          {message}
        </p>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          Tentar novamente
        </button>
      </section>
    );
  }
  if (!summary) return null;

  const statusCards = Object.entries(labels) as Array<[keyof typeof labels, string]>;
  const priorityMax = Math.max(1, ...Object.values(summary.byPriority));
  const categoryMax = Math.max(1, ...Object.values(summary.byCategory));

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Atendimento</p>
          <h1 id="dashboard-title">Dashboard</h1>
          <p className="supporting-text">
            Indicadores da fila operacional no escopo do seu perfil.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      <div className="metric-grid">
        {statusCards.map(([key, label]) => (
          <article className="metric-card" key={key}>
            <span>{label}</span>
            <strong>{summary[key]}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-columns">
        <section className="dashboard-panel" aria-labelledby="sla-title">
          <h2 id="sla-title">SLA</h2>
          <dl className="metric-list">
            <div>
              <dt>Primeira resposta vencida</dt>
              <dd>{summary.firstResponseBreached}</dd>
            </div>
            <div>
              <dt>Resolução vencida</dt>
              <dd>{summary.resolutionBreached}</dd>
            </div>
            <div>
              <dt>Primeira resposta em risco</dt>
              <dd>{summary.firstResponseAtRisk}</dd>
            </div>
            <div>
              <dt>Resolução em risco</dt>
              <dd>{summary.resolutionAtRisk}</dd>
            </div>
            <div>
              <dt>Taxa de primeira resposta</dt>
              <dd>{percent(summary.firstResponseRate)}</dd>
            </div>
            <div>
              <dt>Taxa de resolução</dt>
              <dd>{percent(summary.resolutionRate)}</dd>
            </div>
            <div>
              <dt>Média até primeira resposta</dt>
              <dd>{minutes(summary.avgMinutesToFirstResponse)}</dd>
            </div>
            <div>
              <dt>Média até resolução</dt>
              <dd>{minutes(summary.avgMinutesToResolution)}</dd>
            </div>
          </dl>
          <p className="supporting-text small-text">
            Taxas: cumpridos dentro do prazo ÷ tickets concluídos na métrica. Médias consideram
            apenas tickets concluídos.
          </p>
        </section>

        <section className="dashboard-panel" aria-labelledby="priority-title">
          <h2 id="priority-title">Por prioridade</h2>
          <div className="bar-list">
            {(Object.entries(summary.byPriority) as Array<[TicketPriority, number]>).map(
              ([label, count]) => (
                <div className="bar-row" key={label}>
                  <span>{formatTicketPriority(label)}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(count / priorityMax) * 100}%` }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              ),
            )}
          </div>
          <h2>Por categoria</h2>
          {Object.keys(summary.byCategory).length === 0 ? (
            <p className="empty-state">Sem tickets categorizados.</p>
          ) : (
            <div className="bar-list">
              {Object.entries(summary.byCategory).map(([label, count]) => (
                <div className="bar-row" key={label}>
                  <span>{label}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(count / categoryMax) * 100}%` }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="attention-title">
        <h2 id="attention-title">Tickets que exigem atenção</h2>
        {summary.attentionList.length === 0 ? (
          <p className="empty-state">Nenhum ticket exige atenção agora.</p>
        ) : (
          <ul className="ticket-list">
            {summary.attentionList.map((ticket) => (
              <li key={ticket.id}>
                <button
                  className="ticket-card"
                  type="button"
                  onClick={() => onOpenTicket(ticket.id)}
                >
                  <span className="ticket-code">{ticket.code}</span>
                  <strong>{ticket.title}</strong>
                  <span className="ticket-card-meta">
                    <span className={statusBadgeClass(ticket.status)}>
                      {formatTicketStatus(ticket.status)}
                    </span>
                    <span className={priorityBadgeClass(ticket.priority)}>
                      {formatTicketPriority(ticket.priority)}
                    </span>
                    <span>{ticket.assignee ? ticket.assignee.name : 'Sem responsável'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
