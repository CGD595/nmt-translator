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
  sharchop: {
    endpoint: "https://chimegd-tts-api.hf.space/synthesize/sharchop",
    available: true,
    label: "Tshangla TTS",
  },
  // later
  // dzonglish: {
  //   endpoint: "https://chimegd-tts-api.hf.space/synthesize/dzongkha",
  //   available: true,
  //   label: "Dzongkha TTS",
  // },
};

const LOGO_SRC = getEnv("BASE_URL", "/") + "logo.png";

export default function App() {
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const audioCacheRef = useRef(new Map()); // key -> blob url

  const [target, setTarget] = useState("sharchop");
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
  const hasTTS = !!TTS_MODELS[target]?.endpoint;

  const canTranslate = useMemo(
    () => inputText.trim().length > 0 && !isTranslating,
    [inputText, isTranslating]
  );

  const hasOutput = outputMode === "text" && !!outputText;
  const isPlaying = voiceState === "playing";
  const isVoiceLoading = voiceState === "loading";
  const isVoiceDisabled = !hasOutput || !hasTTS || isVoiceLoading;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const getAudioCacheKey = (lang, text) => `${lang}::${text.trim()}`;

  const handleVoice = async () => {
    if (!outputText || !hasTTS) return;

    if (voiceState === "playing") {
      stopAudio();
      setVoiceState("idle");
      return;
    }

    const model = TTS_MODELS[target];
    if (!model?.endpoint) return;

    const trimmedText = outputText.trim();
    const cacheKey = getAudioCacheKey(target, trimmedText);

    setVoiceState("loading");
    setError("");

    try {
      let audioUrl = audioCacheRef.current.get(cacheKey);

      if (!audioUrl) {
        const res = await fetch(model.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmedText }),
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);
        audioCacheRef.current.set(cacheKey, audioUrl);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => setVoiceState("idle");
      audio.onerror = () => {
        setVoiceState("idle");
        setError("⚠ Voice playback failed.");
      };

      await audio.play();
      setVoiceState("playing");
    } catch (err) {
      setVoiceState("idle");
      setError(`⚠ Voice synthesis failed: ${err?.message || "Unknown error"}`);
    }
  };

  useEffect(() => {
    stopAudio();
    setVoiceState("idle");
  }, [target, outputText]);

  useEffect(() => {
    return () => {
      stopAudio();
      for (const url of audioCacheRef.current.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore cleanup failure
        }
      }
      audioCacheRef.current.clear();
    };
  }, []);

  const clearInput = () => {
    setInputText("");
    setOutputText("");
    setDisplayText("");
    setOutputMode("placeholder");
    setError("");
    setStatus({ text: "Ready", kind: "" });
    setTimeInfo("");
    setCopyState({ label: "Copy", done: false });
    stopAudio();
    setVoiceState("idle");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const copyOutput = async () => {
    if (outputMode !== "text" || !outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyState({ label: "Copied", done: true });
      window.setTimeout(() => setCopyState({ label: "Copy", done: false }), 1800);
    } catch {
      setError("⚠ Could not copy text.");
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

  return (
    <>
      <nav>
        <a className="nav-logo" href="#">
          <img
            src={LOGO_SRC}
            alt="Aplos Labs logo"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
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

                <div className="action-group">
                  <button
                    className={[
                      "btn-voice",
                      hasOutput && hasTTS ? "active" : "",
                      isPlaying ? "playing" : "",
                      isVoiceLoading ? "loading" : "",
                      isVoiceDisabled ? "disabled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    onClick={handleVoice}
                    disabled={isVoiceDisabled}
                    aria-label={isPlaying ? "Stop audio" : "Listen to translation"}
                    title={
                      !hasOutput
                        ? "Translate something first"
                        : !hasTTS
                        ? "Voice not available for Dzonglish yet"
                        : isPlaying
                        ? "Stop"
                        : "Listen"
                    }
                  >
                    {isVoiceLoading ? (
                      <svg
                        className="spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
                        <path d="M12 3a9 9 0 0 1 9 9" />
                      </svg>
                    ) : isPlaying ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1.5" />
                        <rect x="14" y="4" width="4" height="16" rx="1.5" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
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