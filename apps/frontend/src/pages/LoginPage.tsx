import { useRef, useState, type FormEvent } from 'react';

import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../services/api';

type FieldErrors = { email?: string; password?: string };

export function LoginPage() {
  const { login, sessionNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errorRef = useRef<HTMLParagraphElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function validate(): boolean {
    const errors: FieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Informe o e-mail.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      errors.email = 'Informe um e-mail válido.';
    }

    if (!password) {
      errors.password = 'Informe a senha.';
    } else if (password.length < 12) {
      errors.password = 'A senha deve ter ao menos 12 caracteres.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return; // protecao contra duplo envio
    setError('');

    if (!validate()) {
      // Leva o foco ao primeiro campo invalido para navegacao por teclado.
      if (fieldErrors.email) emailRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (requestError) {
      const msg =
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível entrar. Tente novamente.';
      setError(msg);
      errorRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-title">
      <p className="eyebrow">SupportFlow</p>
      <h1 id="login-title">Acesse sua conta</h1>
      <p className="supporting-text">Entre com o e-mail e a senha cadastrados.</p>

      {sessionNotice ? (
        <p className="form-notice" role="status">
          {sessionNotice}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="login-form" aria-busy={isSubmitting} noValidate>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          ref={emailRef}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
          required
          disabled={isSubmitting}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
        />
        {fieldErrors.email ? (
          <p className="form-error" id="login-email-error" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}

        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          required
          minLength={12}
          disabled={isSubmitting}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={
            fieldErrors.password
              ? 'login-password-error login-password-hint'
              : 'login-password-hint'
          }
        />
        <p className="supporting-text small-text" id="login-password-hint">
          A senha cadastrada tem no mínimo 12 caracteres.
        </p>
        {fieldErrors.password ? (
          <p className="form-error" id="login-password-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}

        {error ? (
          <p className="form-error" role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
