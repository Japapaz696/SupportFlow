import { useCallback, useEffect, useState } from 'react';
import type {
  HttpMethod,
  TicketTechnicalDiagnostic,
  TicketTechnicalDiagnosticUpsert,
} from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import {
  ApiError,
  getTicketTechnicalDiagnostic,
  saveTicketTechnicalDiagnostic,
} from '../services/api';

type Props = {
  ticketId: string;
  isMutable?: boolean;
  onUpdated: () => void;
};

export function TicketTechnicalDiagnosticPanel({ ticketId, isMutable = true, onUpdated }: Props) {
  const { token, user } = useAuth();
  const [diagnostic, setDiagnostic] = useState<TicketTechnicalDiagnostic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isTeam = user?.role === 'agent' || user?.role === 'manager' || user?.role === 'admin';

  const [state, setState] = useState({
    environment: '',
    affectedSystem: '',
    apiEndpoint: '',
    apiMethod: '' as HttpMethod | '',
    httpStatusCode: '',
    errorSummary: '',
    logs: '',
    sqlEvidence: '',
    serviceStatus: '',
    notes: '',
  });

  const loadDiagnostic = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const data = await getTicketTechnicalDiagnostic(token, ticketId);
      if (data) {
        setDiagnostic(data);
        setState({
          environment: data.environment ?? '',
          affectedSystem: data.affectedSystem ?? '',
          apiEndpoint: data.apiEndpoint ?? '',
          apiMethod: data.apiMethod ?? '',
          httpStatusCode: data.httpStatusCode?.toString() ?? '',
          errorSummary: data.errorSummary ?? '',
          logs: data.logs ?? '',
          sqlEvidence: data.sqlEvidence ?? '',
          serviceStatus: data.serviceStatus ?? '',
          notes: data.notes ?? '',
        });
      }
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Erro ao carregar diagnóstico técnico.');
    } finally {
      setIsLoading(false);
    }
  }, [ticketId, token]);

  useEffect(() => {
    void loadDiagnostic();
  }, [loadDiagnostic]);

  if (!isTeam) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setIsSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const payload: TicketTechnicalDiagnosticUpsert = {
        environment: state.environment || null,
        affectedSystem: state.affectedSystem || null,
        apiEndpoint: state.apiEndpoint || null,
        apiMethod: state.apiMethod || null,
        httpStatusCode: state.httpStatusCode ? parseInt(state.httpStatusCode, 10) : null,
        errorSummary: state.errorSummary || null,
        logs: state.logs || null,
        sqlEvidence: state.sqlEvidence || null,
        serviceStatus: state.serviceStatus || null,
        notes: state.notes || null,
      };
      await saveTicketTechnicalDiagnostic(token, ticketId, payload);
      await loadDiagnostic();
      onUpdated();
      setSuccessMessage('Diagnóstico técnico salvo com sucesso!');
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : 'Não foi possível salvar o diagnóstico.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="diagnostic-panel" aria-labelledby="diagnostic-title">
      <h2 id="diagnostic-title">Diagnóstico Técnico</h2>
      <p className="supporting-text" role="note" aria-label="Aviso de segurança">
        Não inclua senhas, tokens, Authorization headers, cookies, chaves de API, secrets ou strings
        de conexão.
      </p>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {isLoading ? (
        <p role="status">Carregando diagnóstico técnico…</p>
      ) : (
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="diagnostic-environment">Ambiente</label>
            <input
              id="diagnostic-environment"
              type="text"
              value={state.environment}
              onChange={(e) => setState({ ...state, environment: e.target.value })}
              maxLength={120}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-affected-system">Sistema afetado</label>
            <input
              id="diagnostic-affected-system"
              type="text"
              value={state.affectedSystem}
              onChange={(e) => setState({ ...state, affectedSystem: e.target.value })}
              maxLength={160}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-api-endpoint">Endpoint</label>
            <input
              id="diagnostic-api-endpoint"
              type="text"
              value={state.apiEndpoint}
              onChange={(e) => setState({ ...state, apiEndpoint: e.target.value })}
              maxLength={500}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-api-method">Método HTTP</label>
            <select
              id="diagnostic-api-method"
              value={state.apiMethod}
              onChange={(e) => setState({ ...state, apiMethod: e.target.value as HttpMethod })}
              disabled={isSaving || !isMutable}
            >
              <option value="">Selecione</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
              <option value="OPTIONS">OPTIONS</option>
              <option value="HEAD">HEAD</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-http-status">Status HTTP</label>
            <input
              id="diagnostic-http-status"
              type="number"
              min={100}
              max={599}
              value={state.httpStatusCode}
              onChange={(e) => setState({ ...state, httpStatusCode: e.target.value })}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-error-summary">Resumo do erro</label>
            <textarea
              id="diagnostic-error-summary"
              value={state.errorSummary}
              onChange={(e) => setState({ ...state, errorSummary: e.target.value })}
              rows={2}
              maxLength={2000}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-logs">Logs</label>
            <textarea
              id="diagnostic-logs"
              value={state.logs}
              onChange={(e) => setState({ ...state, logs: e.target.value })}
              rows={3}
              maxLength={10000}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-sql">Evidências SQL</label>
            <textarea
              id="diagnostic-sql"
              value={state.sqlEvidence}
              onChange={(e) => setState({ ...state, sqlEvidence: e.target.value })}
              rows={3}
              maxLength={10000}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-service-status">Status de serviço</label>
            <input
              id="diagnostic-service-status"
              type="text"
              value={state.serviceStatus}
              onChange={(e) => setState({ ...state, serviceStatus: e.target.value })}
              maxLength={1000}
              disabled={isSaving || !isMutable}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diagnostic-notes">Observações</label>
            <textarea
              id="diagnostic-notes"
              value={state.notes}
              onChange={(e) => setState({ ...state, notes: e.target.value })}
              rows={3}
              maxLength={10000}
              disabled={isSaving || !isMutable}
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="form-success" role="alert">
              {successMessage}
            </p>
          )}

          {!diagnostic && !isLoading && (
            <div className="empty-state">
              <p>Nenhum diagnóstico técnico registrado ainda.</p>
            </div>
          )}

          <button type="submit" disabled={isSaving || !isMutable}>
            {isSaving ? 'Salvando…' : diagnostic ? 'Atualizar diagnóstico' : 'Salvar diagnóstico'}
          </button>
        </form>
      )}
    </section>
  );
}
