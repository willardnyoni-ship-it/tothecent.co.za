import { Component } from 'react';

// There was no error boundary anywhere in this app - any render-time
// exception (a bad OCR result shape, anything) unmounted the whole React
// tree with nothing on screen and no way to recover except a hard reload.
// This catches that instead of letting it happen silently.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Caught by ErrorBoundary:', error, info); }
  componentDidUpdate(prevProps) {
    // Lets a sheet-scoped boundary clear itself when the sheet's content
    // changes (e.g. the user backs out and opens something else) rather
    // than staying stuck on the old error forever.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return this.props.fallback
        ? this.props.fallback(this.state.error)
        : (
          <div className="card" style={{ margin: 14, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Something went wrong</div>
            <div className="mini" style={{ marginBottom: 12 }}>{this.state.error.message || 'Unknown error'}</div>
            <button className="b" onClick={() => window.location.reload()}>Reload</button>
          </div>
        );
    }
    return this.props.children;
  }
}
