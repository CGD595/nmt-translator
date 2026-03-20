import React, { useMemo, useRef, useState } from "react";

const DEFAULT_API_BASE = "https://chimegd-nmt-api.hf.space";
const API_BASE = (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(
  /\/+$/,
  "",
);

const LOGO_SRC = import.meta.env.BASE_URL + "logo.png";

export default function App() {
  const inputRef = useRef(null);

  const [target, setTarget] = useState("dzonglish");
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [outputMode, setOutputMode] = useState("placeholder");
  const [error, setError] = useState("");
  const [status, setStatus] = useState({ text: "Ready", kind: "" });
  const [timeInfo, setTimeInfo] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [copyState, setCopyState] = useState({ label: "Copy", done: false });

  const charCount = inputText.length;
  const warnCount = charCount > 1800;
  const canTranslate = useMemo(
    () => inputText.trim().length > 0 && !isTranslating,
    [inputText, isTranslating],
  );

  const clearInput = () => {
    setInputText("");
    setOutputText("");
    setDisplayText("");
    setOutputMode("placeholder");
    setError("");
    setStatus({ text: "Ready", kind: "" });
    setTimeInfo("");
    setCopyState({ label: "Copy", done: false });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const copyOutput = async () => {
    if (outputMode !== "text" || !outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyState({ label: "Copied", done: true });
      window.setTimeout(
        () => setCopyState({ label: "Copy", done: false }),
        1800,
      );
    } catch {
      // Clipboard permissions vary by browser.
    }
  };

  const translate = async () => {
    const text = inputText.trim();
    if (!text) return;

    setIsTranslating(true);
    setError("");
    setStatus({ text: "Working…", kind: "" });
    setTimeInfo("");
    setOutputText("");
    setDisplayText("");
    setOutputMode("translating");
    setCopyState({ label: "Copy", done: false });

    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.translation) throw new Error("Empty response from API");

      const full = data.translation;
      setOutputText(full);
      setOutputMode("text");
      setTimeInfo(`${((performance.now() - t0) / 1000).toFixed(2)}s`);
      setStatus({ text: "Done", kind: "ok" });

      // Typewriter — character by character
      setDisplayText("");
      for (let i = 0; i <= full.length; i++) {
        await new Promise((r) => setTimeout(r, 30));
        setDisplayText(full.slice(0, i));
      }
    } catch (err) {
      setOutputText("");
      setDisplayText("");
      setOutputMode("placeholder");
      setError(
        `⚠ ${err?.message || "Translation failed. Check your API endpoint."}`,
      );
      setStatus({ text: "Error", kind: "err" });
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <>
      <nav>
        <a className="nav-logo" href="#">
          <img src={LOGO_SRC} alt="Aplos Labs logo" />
          <span className="nav-logo-text">Aplos Labs</span>
        </a>
      </nav>

      <div className="page">
        <header>
          <h1>
            Translate English into
            <br />
            <em>Dzonglish &amp; Sharchop.</em>
          </h1>
        </header>

        <div className="card">
          <div className="lang-bar">
            <div className="lang-cell">
              <span className="lang-label">From</span>
              <span className="lang-name">English</span>
            </div>
            <div className="lang-div"></div>
            <div className="lang-cell right">
              <span className="lang-label">To</span>
              <div className="select-wrap">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-label="Target language"
                >
                  <option value="dzonglish">Dzonglish</option>
                  <option value="sharchop">Sharchop</option>
                </select>
              </div>
            </div>
          </div>

          <div className="panels">
            <div className="panel">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                    translate();
                }}
                placeholder="Enter English text…"
                maxLength={100}
                spellCheck={true}
                aria-label="Source text"
              />
              <div className="panel-foot">
                <span className={`char-count ${warnCount ? "warn" : ""}`}>
                  {charCount} / 100
                </span>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={clearInput}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="panel-sep"></div>

            <div className="panel">
              <div
                className={[
                  "output-area",
                  outputMode === "placeholder" ? "placeholder" : "",
                  outputMode === "translating" ? "translating" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {outputMode === "translating" ? (
                  <span className="dots">Translating</span>
                ) : outputMode === "placeholder" ? (
                  "Translation will appear here…"
                ) : (
                  <>
                    {displayText}
                    {displayText.length < outputText.length && (
                      <span className="cursor">|</span>
                    )}
                  </>
                )}
              </div>
              <div className="panel-foot">
                <span className="time-info">{timeInfo}</span>
                <button
                  className={`btn-ghost ${copyState.done ? "done" : ""}`}
                  type="button"
                  onClick={copyOutput}
                  disabled={outputMode !== "text" || !outputText}
                >
                  {copyState.label}
                </button>
              </div>
            </div>
          </div>

          <div className={`error-bar ${error ? "show" : ""}`}>{error}</div>

          <div className="action-bar">
            <span className={`status ${status.kind}`.trim()}>
              {status.text}
            </span>
            <button
              className={`btn-translate ${isTranslating ? "loading" : ""}`}
              type="button"
              onClick={translate}
              disabled={!canTranslate}
            >
              <div className="spinner"></div>
              <span>Translate</span>
            </button>
          </div>
        </div>

        <footer>© 2026 Aplos Labs · Bhutan Language AI</footer>
      </div>
    </>
  );
}
