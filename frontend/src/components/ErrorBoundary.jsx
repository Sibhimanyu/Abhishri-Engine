import React from 'react';

/**
 * Catches render-time errors below it — most importantly a rejected React.lazy
 * import. Routes are code-split, so a session left open across a deploy can ask
 * for a hashed chunk the new release deleted; without this boundary that error
 * unmounted the entire app into a white screen. Chunk-load failures are almost
 * always cured by reloading (the fresh index.html references the new chunks),
 * so that case gets a reload-centric message.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const msg = String(this.state.error?.message || this.state.error);
    const isStaleChunk = /dynamically imported module|Loading chunk|import\(\)|Failed to fetch/i.test(msg);

    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-3 p-8 text-center">
        <h3 className="text-lg font-bold text-brand-text">
          {isStaleChunk ? 'A new version of the app is available' : 'Something went wrong'}
        </h3>
        <p className="text-sm text-brand-text-dim max-w-md">
          {isStaleChunk
            ? 'The app was updated while this tab was open. Reload to get the latest version.'
            : 'An unexpected error occurred. Reloading usually fixes it.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }
}
