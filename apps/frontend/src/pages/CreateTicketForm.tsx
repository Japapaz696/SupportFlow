import { useEffect, useState, type FormEvent } from 'react';
import type { Category, TicketPriority } from '@supportflow/shared';

import { ApiError, createTicket, listCategories } from '../services/api';
import { useToast } from '../components/Toast';

type Props = {
  token: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export function CreateTicketForm({ token, onCancel, onCreated }: Props) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    description?: string;
    category?: string;
  }>({});
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function loadCategories() {
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
        const msg =
          error instanceof ApiError ? error.message : 'Não foi possível carregar categorias.';
        setMessage(msg);
        showToast('error', msg);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingCategories(false);
      });

    return () => {
      isCurrent = false;
    };
  }

  useEffect(() => {
    return loadCategories();
  }, [token]);

  function validate(): boolean {
    const errors: { title?: string; description?: string; category?: string } = {};
    if (!title.trim()) errors.title = 'Título é obrigatório.';
    else if (title.trim().length < 5) errors.title = 'Título deve ter ao menos 5 caracteres.';
    if (!description.trim()) errors.description = 'Descrição é obrigatória.';
    else if (description.trim().length < 10)
      errors.description = 'Descrição deve ter ao menos 10 caracteres.';
    if (!categoryId) errors.category = 'Selecione uma categoria.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    if (isSubmitting) return; // proteção contra duplo envio
    setMessage('');
    setIsSubmitting(true);

    try {
      const ticket = await createTicket(token, {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        ...(priority ? { priority } : {}),
      });
      showToast('success', 'Chamado criado com sucesso.');
      onCreated(ticket.id);
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Não foi possível criar o chamado.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="ticket-section" aria-labelledby="create-ticket-title">
      <p className="eyebrow">Novo chamado</p>
      <h1 id="create-ticket-title">Abrir chamado</h1>
      <p className="supporting-text">
        Descreva o problema. A prioridade pode seguir o padrão da categoria.
      </p>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="ticket-title">Título *</label>
        <input
          id="ticket-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setFieldErrors((e) => ({ ...e, title: undefined }));
          }}
          required
          maxLength={160}
          disabled={isSubmitting}
          aria-invalid={!!fieldErrors.title}
          aria-describedby={fieldErrors.title ? 'ticket-title-error' : undefined}
        />
        {fieldErrors.title ? (
          <p className="form-error" id="ticket-title-error" role="alert">
            {fieldErrors.title}
          </p>
        ) : null}

        <label htmlFor="ticket-description">Descrição *</label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setFieldErrors((e) => ({ ...e, description: undefined }));
          }}
          required
          maxLength={5000}
          rows={5}
          disabled={isSubmitting}
          aria-invalid={!!fieldErrors.description}
          aria-describedby={fieldErrors.description ? 'ticket-desc-error' : undefined}
        />
        {fieldErrors.description ? (
          <p className="form-error" id="ticket-desc-error" role="alert">
            {fieldErrors.description}
          </p>
        ) : null}

        <label htmlFor="ticket-category">Categoria *</label>
        <select
          id="ticket-category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setFieldErrors((e) => ({ ...e, category: undefined }));
          }}
          required
          disabled={isLoadingCategories || isSubmitting || categories.length === 0}
          aria-invalid={!!fieldErrors.category}
        >
          {isLoadingCategories ? <option value="">Carregando categorias…</option> : null}
          {!isLoadingCategories && categories.length === 0 ? (
            <option value="">Nenhuma categoria disponível</option>
          ) : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {fieldErrors.category ? (
          <p className="form-error" role="alert">
            {fieldErrors.category}
          </p>
        ) : null}

        <label htmlFor="ticket-priority">Prioridade</label>
        <select
          id="ticket-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TicketPriority | '')}
          disabled={isSubmitting}
        >
          <option value="">Padrão da categoria</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>

        {message ? (
          <div className="form-error" role="alert">
            <p>{message}</p>
            {categories.length === 0 ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => loadCategories()}
                disabled={isLoadingCategories}
              >
                Recarregar categorias
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
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
