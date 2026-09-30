import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Category, TicketPriority } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { ApiError, createCategory, listCategories, updateCategory } from '../services/api';
import { formatTicketPriority } from '../ui/labels';

const priorities: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

export function CategoriesAdminPage() {
  const { token, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultPriority, setDefaultPriority] = useState<TicketPriority>('medium');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    setSuccessMessage('');
    try {
      setCategories(await listCategories(token, true));
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível carregar as categorias.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      if (editingId) {
        await updateCategory(token, editingId, {
          name: name.trim(),
          description: description.trim() || null,
          defaultPriority,
        });
      } else {
        await createCategory(token, {
          name: name.trim(),
          description: description.trim() || null,
          defaultPriority,
        });
      }
      setName('');
      setDescription('');
      setDefaultPriority('medium');
      setEditingId(null);
      await load();
      setSuccessMessage('Categoria salva com sucesso!');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível salvar a categoria.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description ?? '');
    setDefaultPriority(category.defaultPriority);
  }

  async function toggle(category: Category) {
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      await updateCategory(token, category.id, { isActive: !category.isActive });
      await load();
      setSuccessMessage(`Categoria ${category.isActive ? 'desativada' : 'ativada'} com sucesso!`);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a categoria.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user || (user.role !== 'manager' && user.role !== 'admin')) {
    return (
      <section className="home-page wide" aria-label="Acesso restrito">
        <p className="form-error" role="alert">
          Você não tem permissão para administrar categorias.
        </p>
      </section>
    );
  }

  return (
    <section className="categories-page" aria-labelledby="categories-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Configuração</p>
          <h1 id="categories-title">Categorias</h1>
          <p className="supporting-text">
            Gerencie as categorias de chamados. Inativas não aparecem no cadastro.
          </p>
        </div>
      </div>

      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {successMessage && (
        <p className="form-success" role="alert">
          {successMessage}
        </p>
      )}
      {isLoading ? <p role="status">Carregando categorias…</p> : null}
      {!isLoading && categories.length === 0 ? (
        <p className="empty-state">Nenhuma categoria encontrada.</p>
      ) : null}
      <ul className="policy-list">
        {categories.map((category) => (
          <li key={category.id}>
            <strong>{category.name}</strong>
            <span>
              {category.description ?? 'Sem descrição'} · padrão{' '}
              {formatTicketPriority(category.defaultPriority)}
            </span>
            <span>{category.isActive ? 'Ativa' : 'Inativa'}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={() => void toggle(category)}
            >
              {category.isActive ? 'Desativar' : 'Ativar'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={() => startEdit(category)}
            >
              Editar
            </button>
          </li>
        ))}
      </ul>

      <form className="policy-form" onSubmit={submit}>
        <label>
          Nome
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label>
          Descrição
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </label>
        <label>
          Prioridade padrão
          <select
            value={defaultPriority}
            onChange={(event) => setDefaultPriority(event.target.value as TicketPriority)}
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {formatTicketPriority(priority)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : editingId ? 'Atualizar categoria' : 'Criar categoria'}
        </button>
      </form>
    </section>
  );
}
