import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Category, TicketPriority } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { ApiError, createCategory, listCategories, updateCategory } from '../services/api';
import { formatTicketPriority } from '../ui/labels';

const priorities: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

export function CategoriesAdminPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultPriority, setDefaultPriority] = useState<TicketPriority>('medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      setCategories(await listCategories(token, true));
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível carregar as categorias.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (isSubmitting) return; // protecao contra duplo envio

    if (name.trim().length < 2) {
      setFieldError('Informe um nome com ao menos 2 caracteres.');
      return;
    }
    setFieldError('');

    setIsSubmitting(true);
    setMessage('');
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
      showToast('success', 'Categoria salva com sucesso.');
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível salvar a categoria.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description ?? '');
    setDefaultPriority(category.defaultPriority);
    setFieldError('');
  }

  async function toggle(category: Category) {
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      await updateCategory(token, category.id, { isActive: !category.isActive });
      await load();
      showToast(
        'success',
        `Categoria ${category.isActive ? 'desativada' : 'ativada'} com sucesso.`,
      );
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a categoria.';
      setMessage(msg);
      showToast('error', msg);
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
      {isLoading ? (
        <div className="skeleton-stack" aria-hidden="true">
          <div className="skeleton skeleton--block" />
        </div>
      ) : null}
      {!isLoading && categories.length === 0 ? (
        <div className="empty-state-box">
          <h3>Nenhuma categoria encontrada</h3>
          <p className="supporting-text">
            Crie a primeira categoria no formulário abaixo para que os chamados possam ser
            classificados.
          </p>
        </div>
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

      <form className="policy-form" onSubmit={submit} noValidate>
        <label>
          Nome
          <input
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError('');
            }}
            required
            maxLength={120}
            disabled={isSubmitting}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? 'category-name-error' : undefined}
          />
        </label>
        {fieldError ? (
          <p className="form-error" id="category-name-error" role="alert">
            {fieldError}
          </p>
        ) : null}
        <label>
          Descrição
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            disabled={isSubmitting}
          />
        </label>
        <label>
          Prioridade padrão
          <select
            value={defaultPriority}
            onChange={(event) => setDefaultPriority(event.target.value as TicketPriority)}
            disabled={isSubmitting}
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
        {editingId ? (
          <button
            className="secondary-button"
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setEditingId(null);
              setName('');
              setDescription('');
              setDefaultPriority('medium');
              setFieldError('');
            }}
          >
            Cancelar edição
          </button>
        ) : null}
      </form>
    </section>
  );
}
