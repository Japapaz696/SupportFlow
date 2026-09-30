import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SlaPolicy, TicketPriority } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { ApiError, createSlaPolicy, listSlaPolicies, updateSlaPolicy } from '../services/api';

const priorities: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

export function SlaPoliciesPage() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priority, setPriority] = useState<TicketPriority>('critical');
  const [firstResponseMinutes, setFirstResponseMinutes] = useState('60');
  const [resolutionMinutes, setResolutionMinutes] = useState('240');

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    setSuccessMessage('');
    try {
      setPolicies(await listSlaPolicies(token));
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível carregar as políticas.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const existing = policies.find((policy) => policy.priority === priority);
    if (existing) {
      setFirstResponseMinutes(String(existing.firstResponseMinutes));
      setResolutionMinutes(String(existing.resolutionMinutes));
    }
  }, [policies, priority]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      const existing = policies.find((policy) => policy.priority === priority);
      const durations = {
        firstResponseMinutes: Number(firstResponseMinutes),
        resolutionMinutes: Number(resolutionMinutes),
      };
      if (existing) {
        await updateSlaPolicy(token, existing.id, durations);
      } else {
        await createSlaPolicy(token, { priority, ...durations });
      }
      await load();
      setSuccessMessage('Política de SLA salva com sucesso!');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível criar a política.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectPriority(value: TicketPriority) {
    setPriority(value);
    const existing = policies.find((policy) => policy.priority === value);
    if (existing) {
      setFirstResponseMinutes(String(existing.firstResponseMinutes));
      setResolutionMinutes(String(existing.resolutionMinutes));
    }
  }

  const selectedPolicy = policies.find((policy) => policy.priority === priority);

  async function toggle(policy: SlaPolicy) {
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      await updateSlaPolicy(token, policy.id, { isActive: !policy.isActive });
      await load();
      setSuccessMessage(
        'Política de SLA ' + (policy.isActive ? 'desativada' : 'ativada') + ' com sucesso!',
      );
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a política.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="sla-policies-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Configuração</p>
          <h1 id="sla-policies-title">Políticas de SLA</h1>
          <p className="supporting-text">
            Tempo corrido. Alterações não recalculam tickets já criados.
          </p>
        </div>
      </div>
      {message ? (
        <div className="form-error" role="alert">
          <p>{message}</p>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      ) : null}
      {successMessage && (
        <p className="form-success" role="alert">
          {successMessage}
        </p>
      )}
      <form className="policy-form" onSubmit={submit}>
        <label>
          Prioridade
          <select
            value={priority}
            onChange={(event) => selectPriority(event.target.value as TicketPriority)}
          >
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Primeira resposta (min)
          <input
            type="number"
            min="1"
            value={firstResponseMinutes}
            onChange={(event) => setFirstResponseMinutes(event.target.value)}
            required
          />
        </label>
        <label>
          Resolução (min)
          <input
            type="number"
            min="1"
            value={resolutionMinutes}
            onChange={(event) => setResolutionMinutes(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : selectedPolicy ? 'Atualizar política' : 'Criar política'}
        </button>
      </form>
      {isLoading ? <p role="status">Carregando políticas…</p> : null}
      {!isLoading && policies.length === 0 ? (
        <p className="empty-state">Nenhuma política cadastrada.</p>
      ) : null}
      <ul className="policy-list">
        {policies.map((policy) => (
          <li key={policy.id}>
            <strong>{policy.priority}</strong>
            <span>Primeira resposta: {policy.firstResponseMinutes} min</span>
            <span>Resolução: {policy.resolutionMinutes} min</span>
            <span>
              {policy.businessHoursOnly ? 'Horário comercial (não operacional)' : 'Tempo corrido'}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={() => void toggle(policy)}
            >
              {policy.isActive ? 'Desativar' : 'Ativar'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
