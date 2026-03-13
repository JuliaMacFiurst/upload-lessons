type Props = {
  logs: string[];
};

export function TranslationLogs({ logs }: Props) {
  return (
    <section className="translations-panel">
      <h2 className="translations-title">Translation Logs</h2>
      <div className="translations-logs">
        {logs.length === 0 && <div className="translations-empty">No logs yet.</div>}
        {logs.map((line, index) => (
          <div className="translations-log-line" key={`${line}-${index}`}>
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}

