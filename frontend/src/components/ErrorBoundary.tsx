import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { mapToSafeErrorMessage } from '../utils/errorMapper';

interface ErrorBoundaryState {
  hasError: boolean;
  safeMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      safeMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      safeMessage: mapToSafeErrorMessage(error, 'Application encountered an unexpected error'),
    };
  }

  componentDidCatch() {
    // Intentionally do not log error objects or state to console to prevent secret leakage
  }

  handleReset = () => {
    this.setState({ hasError: false, safeMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container" role="alert" aria-live="assertive">
          <div className="card">
            <div className="card-title">
              <AlertTriangle size={22} aria-hidden="true" /> Application Recovery Notice
            </div>
            <p className="text-secondary">
              {this.state.safeMessage}
            </p>
            <div>
              <button type="button" className="btn btn-primary" onClick={this.handleReset}>
                <RefreshCw size={16} aria-hidden="true" /> Reset View
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
