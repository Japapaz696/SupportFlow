import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <section className="error-boundary" role="alert">
            <h1>Algo deu errado</h1>
            <p className="supporting-text">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <button className="primary-button" type="button" onClick={this.handleReset}>
              Tentar novamente
            </button>
          </section>
        )
      );
    }
    return this.props.children;
  }
}
