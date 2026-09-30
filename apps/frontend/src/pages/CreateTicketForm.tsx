import { useEffect, useState, type FormEvent } from 'react';
import type { Category, TicketPriority } from '@supportflow/shared';

import { ApiError, createTicket, listCategories } from '../services/api';

type Props = {
  token: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export function CreateTicketForm({ token, onCancel, onCreated }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [message, setMessage] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoadingCategories(true);
    setMessage('');

    listCategories(token)
      .then((items) => {
        if (!isCurrent) return;
        setCategories(items);
        setCategoryId(items[0]?.id ?? '');
      })
      .catch((error) => {
        if (!isCurrent) return;
        setMessage(
          error instanceof ApiError ? error.message : 'Não foi possível carregar categorias.',
        );
      })
      .finally(() => {
        if (isCurrent) setIsLoadingCategories(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const ticket = await createTicket(token, {
        title,
        description,
        categoryId,
        ...(priority ? { priority } : {}),
      });
      onCreated(ticket.id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível criar o chamado.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="home-page" aria-labelledby="create-ticket-title">
      <p className="eyebrow">Novo chamado</p>
      <h1 id="create-ticket-title">Abrir chamado</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="ticket-title">Título</label>
        <input
          id="ticket-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={160}
          disabled={isSubmitting}
        />

        <label htmlFor="ticket-description">Descrição</label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          maxLength={5000}
          rows={5}
          disabled={isSubmitting}
        />

        <label htmlFor="ticket-category">Categoria</label>
        <select
          id="ticket-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          required
          disabled={isLoadingCategories || isSubmitting || categories.length === 0}
        >
          {isLoadingCategories ? <option>Carregando categorias…</option> : null}
          {!isLoadingCategories && categories.length === 0 ? (
            <option>Nenhuma categoria disponível</option>
          ) : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="ticket-priority">Prioridade</label>
        <select
          id="ticket-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TicketPriority | '')}
        >
          <option value="">Padrão da categoria</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>

        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting || categories.length === 0}>
            {isSubmitting ? 'Criando…' : 'Criar chamado'}
          </button>
        </div>
      </form>
    </section>
  );
}
