import React, { useMemo, useRef, useState, useEffect } from "react";
import "../style.css";

// Safe environment variable checks
const getEnv = (key, fallback) => {
  try {
    return import.meta.env[key] || fallback;
  } catch {
    return fallback;
  }
};

const DEFAULT_API_BASE = "https://chimegd-nmt-api.hf.space";
const API_BASE = getEnv("VITE_API_BASE", DEFAULT_API_BASE).replace(/\/+$/, "");

const TTS_MODELS = {
  dzonglish: {
    endpoint: "", // add HF endpoint when ready
    available: false,
    label: "Dzongkha TTS",
  },
  sharchop: {
    endpoint: "", // add HF endpoint when ready
    available: false,
    label: "Tshangla TTS",
  },
};

const LOGO_SRC = getEnv("BASE_URL", "/") + "logo.png";

export default function App() {
  const inputRef = useRef(null);
  const audioRef = useRef(null);

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
  const [voiceState, setVoiceState] = useState("idle"); // idle | loading | playing | error

  const charCount = inputText.length;
  const warnCount = charCount > 1800;
  const canTranslate = useMemo(
    () => inputText.trim().length > 0 && !isTranslating,
    [inputText, isTranslating]
  );

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleVoice = async () => {
    if (!outputText) return;

    if (voiceState === "playing") {
      stopAudio();
      setVoiceState("idle");
      return;
    }

    const model = TTS_MODELS[target];
    if (!model?.endpoint) return;

    setVoiceState("loading");
    try {
      const res = await fetch(model.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: outputText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setVoiceState("idle");
      audio.onerror = () => setVoiceState("idle");
      await audio.play();
      setVoiceState("playing");
    } catch (err) {
      setVoiceState("idle");
    }
  };

  // stop audio when target language changes or output clears
  useEffect(() => {
    stopAudio();
    setVoiceState("idle");
  }, [target, outputText]);

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
      window.setTimeout(() => setCopyState({ label: "Copy", done: false }), 1800);
    } catch {
      /* clipboard may be restricted */
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
    stopAudio();
    setVoiceState("idle");

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

      setDisplayText("");
      for (let i = 0; i <= full.length; i++) {
        await new Promise((r) => setTimeout(r, 30));
        setDisplayText(full.slice(0, i));
      }
    } catch (err) {
      setOutputText("");
      setDisplayText("");
      setOutputMode("placeholder");
      setError(`⚠ ${err?.message || "Translation failed. Check your API endpoint."}`);
      setStatus({ text: "Error", kind: "err" });
    } finally {
      setIsTranslating(false);
    }
  };

  const hasOutput = outputMode === "text" && !!outputText;
  const isPlaying = voiceState === "playing";
  const isVoiceLoading = voiceState === "loading";

  return (
    <>
      <nav>
        <a className="nav-logo" href="#">
          <img src={LOGO_SRC} alt="Aplos Labs logo" onError={(e) => { e.target.style.display = 'none'; }} />
          <span className="nav-logo-text">Aplos Labs</span>
        </a>
      </nav>

      <div className="page">
        <header>
          <h1>
            Translate English into
            <br />
            <em>Dzonglish &amp; Tshangla.</em>
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
                  <option value="sharchop">Tshangla</option>
                </select>
              </div>
            </div>
          </div>

          <div className="panels">
            {/* Source panel */}
            <div className="panel">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") translate();
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
                <button className="btn-ghost" type="button" onClick={clearInput}>
                  Clear
                </button>
              </div>
            </div>

            <div className="panel-sep"></div>

            {/* Output panel */}
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

                {/* Wrapper grouping buttons pushes them to the right edge */}
                <div className="action-group">
                  <button
                    className={[
                      "btn-voice",
                      hasOutput ? "active" : "",
                      isPlaying ? "playing" : "",
                      isVoiceLoading ? "loading" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    onClick={handleVoice}
                    disabled={!hasOutput || isVoiceLoading}
                    aria-label={isPlaying ? "Stop audio" : "Listen to translation"}
                    title={
                      !hasOutput
                        ? "Translate something first"
                        : isPlaying
                        ? "Stop"
                        : "Listen"
                    }
                  >
                    {isVoiceLoading ? (
                      <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
                        <path d="M12 3a9 9 0 0 1 9 9" />
                      </svg>
                    ) : isPlaying ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1.5" />
                        <rect x="14" y="4" width="4" height="16" rx="1.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </svg>
                    )}
                  </button>

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
          </div>

          <div className={`error-bar ${error ? "show" : ""}`}>{error}</div>

          <div className="action-bar">
            <span className={`status ${status.kind}`.trim()}>{status.text}</span>
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