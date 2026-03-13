type Props = {
  totalCharacters: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  costModel: string;
  tokenMethod: "gemini_count_tokens" | "chars_div_4";
};

export function TranslationEstimator(props: Props) {
  return (
    <section className="translations-panel">
      <h2 className="translations-title">Token & Cost Estimation</h2>
      <div className="translations-grid translations-grid--3">
        <div className="translations-info">
          <div className="translations-info__label">Total characters</div>
          <div className="translations-info__value">{props.totalCharacters.toLocaleString()}</div>
        </div>
        <div className="translations-info">
          <div className="translations-info__label">Estimated tokens</div>
          <div className="translations-info__value">{props.estimatedTokens.toLocaleString()}</div>
        </div>
        <div className="translations-info">
          <div className="translations-info__label">Estimated Gemini cost</div>
          <div className="translations-info__value">${props.estimatedCostUsd.toFixed(4)}</div>
        </div>
      </div>
      <p className="translations-hint">{props.costModel}</p>
      <p className="translations-hint">
        Token method:{" "}
        {props.tokenMethod === "gemini_count_tokens"
          ? "Gemini countTokens"
          : "Fallback estimate (1 token ≈ 4 chars)"}
      </p>
    </section>
  );
}
