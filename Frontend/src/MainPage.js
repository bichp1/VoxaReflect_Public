// # ========= IMPORTANT NOTICE =========
// # This code is by no ways a complete program and is only considered an initial working prototype.
// # Thus, no security, scalability, etc. practices are included in the code.
// # We don't provide any guarantee on any aspect of this application. To deploy the code in a real environment,
// # other aspects of software development need to be done, and a team of DevOps, program security engineers and developers
// # should overtake the project when producing the final software.

import './MainPage.css';
import React from 'react';
import Tooltip, { TooltipProps, tooltipClasses } from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Backdrop from '@mui/material/Backdrop';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';
import CircularProgress, {
  CircularProgressProps,
} from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import useTheme from '@mui/material/styles/useTheme';
import useMediaQuery from '@mui/material/useMediaQuery';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import HelpIcon from '@mui/icons-material/Help';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import AccountBoxIcon from '@mui/icons-material/AccountBox';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import KeyboardVoiceIcon from '@mui/icons-material/KeyboardVoice';
import StopIcon from '@mui/icons-material/Stop';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import voxareflectLogo from './voxareflect_logo.png';

const PHASE_SEQUENCE = ["Description", "Feelings", "Evaluation", "Analysis", "Conclusion", "Action Plan"];
const PHASE_LABELS = {
  "Description": { de: "Beschreibung", en: "Description" },
  "Feelings": { de: "Gefühle", en: "Feelings" },
  "Evaluation": { de: "Bewertung", en: "Evaluation" },
  "Analysis": { de: "Analyse", en: "Analysis" },
  "Conclusion": { de: "Schlussfolgerung", en: "Conclusion" },
  "Action Plan": { de: "Aktionsplan", en: "Action Plan" }
};

const resolveServerURL = () => {
  const envValue = (process.env.REACT_APP_SERVER_URL || "").trim();
  if (envValue !== "") {
    return envValue.endsWith("/") ? envValue : `${envValue}/`;
  }
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return `${window.location.origin}/`;
  }
  return "http://localhost:5001/";
};

const serverURL = resolveServerURL();

let hasCreatedNewConversation = false;

const chatInstruction_de = "Beginne mit einer kurzen Beschreibung, worüber du reflektieren möchtest. Wir empfehlen, das Mikrofon zu verwenden.";
const chatInstruction_en = "Start with a short description of what you would like to reflect on. We recommend using the microphone.";

const getChatInstruction = (language) => {
  return language == "de" ? chatInstruction_de : chatInstruction_en;
}

const TTS_SESSION_KEY = "voxareflect-tts-mode";
const DEFAULT_TTS_STYLE = "professional";
const TTS_STYLE_OPTIONS = [
  { value: "warm", label: "Warm" },
  { value: "professional", label: "Professional" }
];
const DEFAULT_TTS_VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy (balanced)" },
  { value: "verse", label: "Verse (calm)" },
  { value: "lumen", label: "Lumen (neutral)" }
];
const VOICE_LABEL_OVERRIDES = {
  alloy: "Alloy",
  cedar: "Cedar",
  marin: "Marin",
  nova: "Nova"
};
const TTS_STYLE_LABELS = TTS_STYLE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});
const DEFAULT_TTS_VOICE = DEFAULT_TTS_VOICE_OPTIONS[0].value;
const TURN_PRESET_DEFAULT = "standard";
const TURN_PRESET_OPTIONS = [
  { value: "short", labelEn: "Short (focused)", labelDe: "Kurz (fokussiert)" },
  { value: "standard", labelEn: "Standard", labelDe: "Standard" },
  { value: "long", labelEn: "Long (in-depth)", labelDe: "Lang (vertieft)" }
];
const TURN_PRESET_VALUE_SET = new Set(TURN_PRESET_OPTIONS.map((option) => option.value));
const DEFAULT_TTS_SPEED = 1.0;
const TTS_SPEED_MIN = 0.85;
const TTS_SPEED_MAX = 1.35;
const TTS_SPEED_STEP = 0.05;

const LEGACY_EDITOR_STORAGE_KEY = "mindbuddy-text";
const EDITOR_STORAGE_KEY = "voxareflect-text";
const loadEditorDraft = () => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return "";
  }
  const newValue = window.localStorage.getItem(EDITOR_STORAGE_KEY);
  if (newValue && newValue.trim() !== "") {
    return newValue;
  }
  const legacyValue = window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY);
  if (legacyValue && legacyValue.trim() !== "") {
    window.localStorage.setItem(EDITOR_STORAGE_KEY, legacyValue);
    window.localStorage.removeItem(LEGACY_EDITOR_STORAGE_KEY);
    return legacyValue;
  }
  return "";
};
const persistEditorDraft = (value) => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  window.localStorage.setItem(EDITOR_STORAGE_KEY, value);
  window.localStorage.removeItem(LEGACY_EDITOR_STORAGE_KEY);
};


const HtmlTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: '#f5f5f9fa',
    color: 'rgba(0, 0, 0, 0.87)',
    maxWidth: 220,
    fontSize: theme.typography.pxToRem(14),
    border: '1px solid #dadde9',
  },
}));

function MainPage({ language, shouldHaveMic, shouldHaveAvatar, studyGroup, setCurrentPage, setLoadingIndicatorOpen, username, conversations, setConversations, theme, onToggleTheme }) {

  const mimeType = "audio/mp4";
  const VOICE_JOB_POLL_INTERVAL_MS = 1500;
  const VOICE_JOB_MAX_POLLS = 60;

  const muiTheme = useTheme();
  const greaterThanLarge = useMediaQuery(muiTheme.breakpoints.up("lg"));

  const [specifity, setSpecifity] = React.useState(""); // "" (at the beginning) - High - Low
  const [specifityWhy, setSpecifityWhy] = React.useState("");
  const [selectedConversation, setSelectedConversation] = React.useState(null);
  const [newMessageInTextBox, setNewMessageInTextBox] = React.useState("");
  const [feedbackText, setFeedbackText] = React.useState("");
  const [numberOfWords, setNumberOfWords] = React.useState(0);
  const [visibilityStatus, setVisibilityStatus] = React.useState("chat"); // both - chat - editor
  const [pastConversationsVisible, setPastConversationsVisible] = React.useState(false);
  const [isUserInfoDialogOpen, setUserInfoDialogOpen] = React.useState(false);
  const [isInformationDialogOpen, setInformationDialogOpen] = React.useState(false);
  const [isHelpDialogOpen, setHelpDialogOpen] = React.useState(false);
  const [isGuideDialogOpen, setGuideDialogOpen] = React.useState(true);
  const [isSpecifityWhyDialogOpen, setSpecifityWhyDialogOpen] = React.useState(false);
  const [helpDialogTab, setHelpDialogTab] = React.useState("overview");
  const [permission, setPermission] = React.useState(false);
  const [stream, setStream] = React.useState(null);
  const mediaRecorder = React.useRef(null);
  const audioContextRef = React.useRef(null);
  const analyserRef = React.useRef(null);
  const dataArrayRef = React.useRef(null);
  const sourceNodeRef = React.useRef(null);
  const animationFrameRef = React.useRef(null);
  const monitorStreamRef = React.useRef(null);
  const voiceJobTimeoutsRef = React.useRef([]);
  const lastLevelUpdateRef = React.useRef(0);
  const ttsAudioRef = React.useRef(null);
  const [recordingStatus, setRecordingStatus] = React.useState("inactive");
  const [audioChunks, setAudioChunks] = React.useState([]);
  const [audio, setAudio] = React.useState(null);
  const [audioLevel, setAudioLevel] = React.useState(0);
  const [haveUsedMic, setHaveUsedMic] = React.useState(false);
  const [ttsPreference, setTtsPreference] = React.useState(() => {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      return "text";
    }
    const storedValue = sessionStorage.getItem(TTS_SESSION_KEY);
    return (storedValue && storedValue !== "") ? storedValue : "text";
  });
  const [isTtsPlaying, setIsTtsPlaying] = React.useState(false);
  const [pendingTts, setPendingTts] = React.useState(null);
  const [conversationTtsSettings, setConversationTtsSettings] = React.useState({});
  const [conversationTurnPresets, setConversationTurnPresets] = React.useState({});
  const [lastTtsMetadata, setLastTtsMetadata] = React.useState({ stylePreset: "", voice: "" });
  const [ttsVoiceOptions, setTtsVoiceOptions] = React.useState(DEFAULT_TTS_VOICE_OPTIONS);
  const [ttsPlaybackRate, setTtsPlaybackRate] = React.useState(DEFAULT_TTS_SPEED);
  const isChatExperience = studyGroup == "1";
  const overviewTabLabel = language == "de" ? "Überblick" : "Overview";
  const chatTabLabel = language == "de" ? "Chat-Tools" : "Chat tools";
  const writingTabLabel = language == "de" ? "Reflektions-Modell" : "Reflection model";
  // DP1 emphasises voice-first, short turns, so reinforce microphone usage in the UI copy.
  const voiceHintLabel = language == "de" ? "Per Mikrofon antworten" : "Use the microphone";
  const voiceHintBody = language == "de"
    ? "Kurze gesprochene Beiträge sind praktisch, du kannst aber jederzeit tippen."
    : "Short spoken turns are practical, and typing stays available anytime.";
  const aiTransparencyHintText = language == "de"
    ? "Hinweis: Dies ist ein KI-gestützter Reflexionscoach und ersetzt keine Lehrperson oder Beratung."
    : "Note: This is an AI-supported reflection coach and does not replace a tutor or counselling.";
  const ttsVoiceHelperText = language == "de"
    ? "Die Antworten werden automatisch erzeugt und mit einer synthetischen Stimme vorgelesen."
    : "Responses are generated automatically and read aloud with a synthetic voice.";
  const turnPresetLabelText = language == "de" ? "Reflektionsdauer" : "Reflection duration";
  const ttsSpeedLabel = language == "de" ? "Abspielgeschwindigkeit" : "Playback speed";
  const ttsSpeedHelper = language == "de" ? "Schneller" : "Faster";
  const ttsSpeedSlowerLabel = language == "de" ? "Langsamer" : "Slower";
  const reflectionSafetyHintText = language == "de"
    ? "Wenn dich ein Thema stark belastet, kann dieses Tool dich nur begrenzt unterstützen. Sprich bei Bedarf mit Freund:innen, Lehrpersonen oder einer Beratungsstelle."
    : "If a topic feels overwhelming, this tool has limits. Reach out to friends, teachers, or counselling services whenever needed.";
  const themeToggleLabel = theme === "dark"
    ? (language === "de" ? "Heller Modus" : "Light mode")
    : (language === "de" ? "Dunkler Modus" : "Dark mode");
  const voiceLabels = React.useMemo(() => {
    return ttsVoiceOptions.reduce((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {});
  }, [ttsVoiceOptions]);
  const turnPresetOptions = React.useMemo(() => {
    return TURN_PRESET_OPTIONS.map((option) => ({
      value: option.value,
      label: language == "de" ? option.labelDe : option.labelEn
    }));
  }, [language]);
  const defaultTtsVoice = React.useMemo(() => {
    if (ttsVoiceOptions.length > 0 && ttsVoiceOptions[0].value) {
      return ttsVoiceOptions[0].value;
    }
    return DEFAULT_TTS_VOICE;
  }, [ttsVoiceOptions]);
  const baseTtsSettings = React.useMemo(() => ({
    stylePreset: DEFAULT_TTS_STYLE,
    ttsVoice: defaultTtsVoice
  }), [defaultTtsVoice]);
  const buildDefaultTtsSettings = React.useCallback(() => ({
    stylePreset: DEFAULT_TTS_STYLE,
    ttsVoice: defaultTtsVoice
  }), [defaultTtsVoice]);
  const getTtsSettingsForConversation = React.useCallback((conversation) => {
    if (conversation == null || conversation["id"] == undefined || conversation["id"] == null) {
      return baseTtsSettings;
    }
    const existing = conversationTtsSettings[conversation["id"]];
    return existing ? existing : baseTtsSettings;
  }, [conversationTtsSettings, baseTtsSettings]);
  const updateTtsSettingsForConversation = React.useCallback((conversation, partialSettings) => {
    if (conversation == null || conversation["id"] == undefined || conversation["id"] == null) {
      return;
    }
    const conversationId = conversation["id"];
    setConversationTtsSettings((prev) => {
      const previous = prev[conversationId] ? prev[conversationId] : buildDefaultTtsSettings();
      return {
        ...prev,
        [conversationId]: {
          ...previous,
          ...partialSettings
        }
      };
    });
  }, [buildDefaultTtsSettings]);
  const applyAllowedVoicesFromServer = React.useCallback((allowedVoices) => {
    if (!Array.isArray(allowedVoices) || allowedVoices.length === 0) {
      return;
    }
    const seen = new Set();
    const normalized = [];
    allowedVoices.forEach((voiceId) => {
      if (typeof voiceId !== "string") {
        return;
      }
      const trimmed = voiceId.trim();
      if (trimmed === "" || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      const label = VOICE_LABEL_OVERRIDES[trimmed] || (trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
      normalized.push({ value: trimmed, label });
    });
    if (normalized.length === 0) {
      return;
    }
    setTtsVoiceOptions(normalized);
    const allowedSet = new Set(normalized.map((option) => option.value));
    const fallbackVoice = normalized[0].value;
    setConversationTtsSettings((prev) => {
      let changed = false;
      const updated = {};
      Object.entries(prev).forEach(([conversationId, settings]) => {
        if (settings && allowedSet.has(settings.ttsVoice)) {
          updated[conversationId] = settings;
        } else if (settings) {
          updated[conversationId] = { ...settings, ttsVoice: fallbackVoice };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, []);
  const getTurnPresetForConversation = React.useCallback((conversation) => {
    if (conversation == null || conversation["id"] == undefined || conversation["id"] == null) {
      return TURN_PRESET_DEFAULT;
    }
    const conversationId = conversation["id"];
    if (conversationTurnPresets[conversationId]) {
      return conversationTurnPresets[conversationId];
    }
    if (conversation["turnPreset"]) {
      return TURN_PRESET_VALUE_SET.has(conversation["turnPreset"])
        ? conversation["turnPreset"]
        : TURN_PRESET_DEFAULT;
    }
    return TURN_PRESET_DEFAULT;
  }, [conversationTurnPresets]);
  const persistTurnPresetLocally = React.useCallback((conversationId, presetValue) => {
    if (conversationId == null || conversationId == undefined) {
      return;
    }
    const normalized = TURN_PRESET_VALUE_SET.has(presetValue) ? presetValue : TURN_PRESET_DEFAULT;
    setConversationTurnPresets((prev) => {
      if (prev[conversationId] === normalized) {
        return prev;
      }
      return {
        ...prev,
        [conversationId]: normalized
      };
    });
  }, []);
  const stopAnyTtsPlayback = React.useCallback(() => {
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
      } catch (error) {
        console.log("TTS pause failed", error);
      }
      ttsAudioRef.current = null;
    }
    setIsTtsPlaying(false);
  }, [setIsTtsPlaying]);

  const clearVoiceJobTimeouts = React.useCallback(() => {
    voiceJobTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    voiceJobTimeoutsRef.current = [];
  }, []);

  const sessionPhase = selectedConversation == null ? null : selectedConversation["phase"];
  const isCurrentSessionFinished = (sessionPhase != null && sessionPhase["isFinished"] === true);

  const renderSessionCompleteNotice = () => {
    if (!isCurrentSessionFinished) {
      return null;
    }
    const noticeText = language == "de"
      ? "Diese Reflexion ist abgeschlossen - du kannst deine Notizen weiterhin lesen oder bearbeiten, aber es wird kein weiteres strukturiertes Feedback mehr geben."
      : "This reflection session is complete – you can still review or edit your notes, but no additional structured feedback will be provided.";
    return (
      <div className='session-complete-banner'>
        {noticeText}
      </div>
    );
  };

  const renderConversationPhaseTimeline = (phaseData) => {
    if (!phaseData || !Array.isArray(PHASE_SEQUENCE)) {
      return null;
    }
    const labelForPhase = (phaseName) => {
      const labels = PHASE_LABELS[phaseName] || {};
      if (language === "de") {
        return labels.de || phaseName;
      }
      return labels.en || phaseName;
    };
    const normalizedStageName = (phaseData["currentStage"] || "").toLowerCase();
    let currentPhaseIndex = PHASE_SEQUENCE.findIndex(
      (phaseName) => phaseName.toLowerCase() === normalizedStageName
    );
    if (currentPhaseIndex === -1) {
      const fallbackIndex = phaseData["currentIndex"] ? phaseData["currentIndex"] - 1 : 0;
      currentPhaseIndex = Math.min(Math.max(fallbackIndex, 0), PHASE_SEQUENCE.length - 1);
    }
    if (phaseData["isFinished"]) {
      currentPhaseIndex = PHASE_SEQUENCE.length - 1;
    }
    return (
      <div className='conversation-phase-progress'>
        {PHASE_SEQUENCE.map((phaseName, index) => {
          const isCompleted = phaseData["isFinished"] || index < currentPhaseIndex;
          const isCurrent = !phaseData["isFinished"] && index === currentPhaseIndex;
          const statusClass = isCompleted ? "completed" : (isCurrent ? "current" : "upcoming");
          return (
            <div
              key={`${phaseName}-${index}`}
              className={`phase-arrow ${statusClass}`}
              title={labelForPhase(phaseName)}
            >
              <span>{labelForPhase(phaseName)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const escapeHtml = (text) => {
    return (text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const formatSummaryForHtml = (text) => {
    if (!text || text.trim() === "") {
      return "";
    }
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n\n/g, "<br /><br />").replace(/\n/g, "<br />");
    return html;
  };

  const buildSummaryMessageContent = (summary) => {
    if (!summary || summary.trim() === "") {
      return "";
    }
    const heading = language == "de"
      ? "<strong>Reflexionszusammenfassung</strong><br />"
      : "<strong>Reflection summary</strong><br />";
    return heading + formatSummaryForHtml(summary);
  };

  const mergeSummaryIntoMessages = (messages, summary) => {
    if (!summary || summary.trim() === "") {
      return Array.isArray(messages) ? messages : [];
    }
    const baseMessages = Array.isArray(messages) ? messages : [];
    const filtered = baseMessages.filter((message) => !message.isSummary);
    return [
      ...filtered,
      {
        sender: "system",
        content: buildSummaryMessageContent(summary),
        buttons: [],
        video: "",
        isSummary: true
      }
    ];
  };

  const applySummaryToConversation = (conversation) => {
    if (!conversation || !conversation.summary) {
      return conversation;
    }
    const mergedMessages = mergeSummaryIntoMessages(conversation.messages, conversation.summary);
    return {
      ...conversation,
      messages: mergedMessages
    };
  };
  const handlePlaybackRateChange = (event) => {
    const value = parseFloat(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }
    setTtsPlaybackRate(value);
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.playbackRate = value;
      } catch (error) {
        console.log("TTS playback rate change failed", error);
      }
    }
  };

  const stopAudioLevelMonitor = React.useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (error) {
        console.log("Source disconnect error", error);
      }
      sourceNodeRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (error) {
        console.log("Analyser disconnect error", error);
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.log("Audio context close error", error);
      }
      audioContextRef.current = null;
    }
    if (monitorStreamRef.current) {
      monitorStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {
          console.log("Monitor track stop error", error);
        }
      });
      monitorStreamRef.current = null;
    }
    dataArrayRef.current = null;
    setAudioLevel(0);
    lastLevelUpdateRef.current = 0;
  }, []);

  const startAudioLevelMonitor = React.useCallback((activeStream) => {
    if (typeof window === "undefined") {
      return;
    }
    if (!activeStream) {
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    stopAudioLevelMonitor();
    try {
      const audioContext = new AudioContextClass();
      const monitorStream = typeof activeStream.clone === "function"
        ? activeStream.clone()
        : new MediaStream(activeStream.getAudioTracks());
      monitorStreamRef.current = monitorStream;
      const source = audioContext.createMediaStreamSource(monitorStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      if (audioContext.state === "suspended") {
        audioContext.resume().catch((error) => {
          console.log("Audio context resume error", error);
        });
      }
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      sourceNodeRef.current = source;
      const updateLevel = () => {
        if (!analyserRef.current || !dataArrayRef.current) {
          return;
        }
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
        let sumSquares = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const value = dataArrayRef.current[i] - 128;
          sumSquares += value * value;
        }
        const rms = Math.sqrt(sumSquares / dataArrayRef.current.length) / 128;
        const cappedLevel = Math.min(1, rms * 2.2);
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (now - lastLevelUpdateRef.current > 33) {
          setAudioLevel(cappedLevel);
          lastLevelUpdateRef.current = now;
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (error) {
      console.log("Audio level monitor error", error);
    }
  }, [stopAudioLevelMonitor]);

  const renderAudioLevelIndicator = (target) => {
    if (recordingStatus !== `recording-${target}`) {
      return null;
    }
    const barCount = 4;
    const bars = Array.from({ length: barCount }, (_, index) => {
      const multiplier = 0.65 + index * 0.2;
      const normalized = Math.min(1, audioLevel * (1 + multiplier));
      const height = 6 + normalized * 40;
      return (
        <span
          key={`audio-level-bar-${target}-${index}`}
          className='audio-level-bar'
          style={{ height: `${height}px` }}
        />
      );
    });
    return (
      <div className='audio-level-indicator' aria-hidden='true'>
        {bars}
      </div>
    );
  };



  const renderTtsControls = () => {
    const label = language == "de" ? "Ausgabe" : "Voice mode";
    const textOnlyLabel = language == "de" ? "Nur Text" : "Text only";
    const audioLabel = language == "de" ? "Antworten vorlesen" : "Read responses aloud";
    const statusText = language == "de"
      ? (isTtsPlaying ? "Wiedergabe läuft" : "Bereit zum Vorlesen")
      : (isTtsPlaying ? "Playing" : "Ready to read");
    const styleLabel = language == "de" ? "Stil" : "Style";
    const voiceLabel = language == "de" ? "Stimme (synthetisch)" : "Voice (synthetic)";
    const disabledMessage = language == "de"
      ? "Wähle eine Reflexion aus, um Stimme & Stil festzulegen."
      : "Select a reflection to adjust style & voice.";
    const canAdjust = selectedConversation != null;
    const currentSettings = getTtsSettingsForConversation(selectedConversation);
    const styleSelectValue = currentSettings.stylePreset;
    const voiceSelectValue = currentSettings.ttsVoice;
    const turnPresetSelectValue = getTurnPresetForConversation(selectedConversation);
    const availableVoiceOptions = ttsVoiceOptions.length > 0;
    const effectiveStyleLabel = lastTtsMetadata.stylePreset
      ? (TTS_STYLE_LABELS[lastTtsMetadata.stylePreset] || lastTtsMetadata.stylePreset)
      : "";
    const effectiveVoiceLabel = lastTtsMetadata.voice
      ? (voiceLabels[lastTtsMetadata.voice] || lastTtsMetadata.voice)
      : "";
    const effectiveDescription = (effectiveStyleLabel || effectiveVoiceLabel) ? (
      language == "de"
        ? `Aktiv: ${effectiveStyleLabel || "-"}, ${effectiveVoiceLabel || "-"}`
        : `Effective: ${effectiveStyleLabel || "-"}, ${effectiveVoiceLabel || "-"}`
    ) : "";
    const formattedSpeed = `${ttsPlaybackRate.toFixed(2)}x`;
    const styleHelpTooltip = language == "de"
      ? (
        <>
          <strong>Auswirkungen:</strong> Stil-Instruktion für die Antwort- und Sprachen-Generierung<br />
          <strong>Warm:</strong> Supportiver, ermutigender Mentor mit Energie<br />
          <strong>Professionell:</strong> Ruhiger, professioneller, akademischer Mentor
        </>
      )
      : (
        <>
          <strong>Warm:</strong> more validating and encouraging tone.<br />
          <strong>Professional:</strong> concise and task-focused.
        </>
      );
    const turnPresetHelpTooltip = language == "de"
      ? (
        <>
          <strong>Auswirkungen:</strong> Steuert die Länge der Reflektion durch Limitierung der Phasen<br />
          <strong>Kurz:</strong> Maximal 2-3 Antworten per Phase<br />
          <strong>Standard (Empfohlen):</strong> Maximal 2-4 Antworten per Phase und Minimum von 2 Antworten in späten Phasen<br />
          <strong>Lang:</strong> Maximal 4-6 Antworten per Phase und Minimum von 2-3 Antworten
        </>
      )
      : "Controls how long a phase stays open: Short ≈ 1–2 coach prompts, Standard keeps a balanced pace, Long invites extra depth.";
    return (
      <div className='tts-control-wrapper'>
        <div className='tts-row'>
          <div className='tts-field tts-mode-field'>
            <label htmlFor='tts-mode-select'>{label}</label>
            <div className='tts-select-stack'>
              <select id='tts-mode-select' value={ttsPreference} onChange={(event) => setTtsPreference(event.target.value)}>
                <option value='text'>{textOnlyLabel}</option>
                <option value='voice'>{audioLabel}</option>
              </select>
              {ttsPreference === "voice" &&
                <span className={`tts-status${isTtsPlaying ? " playing" : ""}`}>{statusText}</span>
              }
            </div>
          </div>
          <div className='tts-field'>
            <div className='tts-label-with-help'>
              <label htmlFor='tts-style-select'>{styleLabel}</label>
              <HtmlTooltip title={styleHelpTooltip}>
                <span>
                  <InfoOutlinedIcon className='tts-help-icon' fontSize='small' />
                </span>
              </HtmlTooltip>
            </div>
            <select
              id='tts-style-select'
              value={styleSelectValue}
              onChange={(event) => handleStylePresetChange(event.target.value)}
              disabled={!canAdjust}
              title={!canAdjust ? disabledMessage : undefined}
            >
              {TTS_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className='tts-field'>
            <label htmlFor='tts-voice-select'>{voiceLabel}</label>
            <select
              id='tts-voice-select'
              value={voiceSelectValue}
              onChange={(event) => handleTtsVoiceChange(event.target.value)}
              disabled={!canAdjust || !availableVoiceOptions}
              title={!canAdjust ? disabledMessage : undefined}
            >
              {ttsVoiceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className='tts-field tts-speed-field'>
            <label htmlFor='tts-speed-slider'>{ttsSpeedLabel}</label>
            <div className='tts-speed-control'>
              <span className='tts-speed-edge'>{ttsSpeedSlowerLabel}</span>
              <input
                id='tts-speed-slider'
                type='range'
                min={TTS_SPEED_MIN}
                max={TTS_SPEED_MAX}
                step={TTS_SPEED_STEP}
                value={ttsPlaybackRate}
                onChange={handlePlaybackRateChange}
              />
              <span className='tts-speed-edge'>{ttsSpeedHelper}</span>
            </div>
            <div className='tts-speed-value'>{formattedSpeed}</div>
          </div>
          <div className='tts-field turn-preset-field'>
            <div className='tts-label-with-help'>
              <label htmlFor='turn-preset-select'>{turnPresetLabelText}</label>
              <HtmlTooltip title={turnPresetHelpTooltip}>
                <span>
                  <InfoOutlinedIcon className='tts-help-icon' fontSize='small' />
                </span>
              </HtmlTooltip>
            </div>
            <select
              id='turn-preset-select'
              value={turnPresetSelectValue}
              onChange={(event) => handleTurnPresetChange(event.target.value)}
              disabled={!canAdjust}
              title={!canAdjust ? disabledMessage : undefined}
            >
              {turnPresetOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {effectiveDescription !== "" &&
            <div className='tts-effective-label'>{effectiveDescription}</div>
          }
        </div>
        <div className='tts-helper-text'>{ttsVoiceHelperText}</div>
      </div>
    );
  };

const renderHelpTabPanel = () => {
    const chatHeader = language == "de" ? "Interaktions-Einstellungen" : "Interaction settings";
    const modelHeader = language == "de" ? "Reflexionsmodell" : "Reflection model";
    if (helpDialogTab === "overview") {
      return language == "de"
        ? (
          <>
            <p>VoxaReflect ist ein KI-gestützter Reflexionscoach, der dich durch strukturierte Reflexionen zu deinen Lern- und Praxiserfahrungen führt.</p>
            <p><strong>Wichtig:</strong> VoxaReflect ist ein technisches Hilfsmittel und ersetzt keine Lehrkraft, Beratungsperson oder professionelle Unterstützung. Die Antworten werden automatisch generiert und das System hat keine Gefühle oder Bewusstsein.</p>
            <p>Links findest du den Verlauf deiner Reflexionen. Mit dem Plus-Button (+) startest du eine neue Reflexion. Oben rechts findest du das Buchsymbol für den Leitfaden und das Fragezeichen für diese Hilfe.</p>
            <p><strong>Datenschutz:</strong> Deine Reflexionen werden gespeichert, damit du sie später aufrufen kannst. Für die KI-Verarbeitung werden Inhalte an OpenAI gesendet. Bei persönlichen oder belastenden Themen wende dich an Freunde, Lehrpersonen oder Beratungsstellen.</p>
          </>
        )
        : (
          <>
            <p>VoxaReflect is an AI-powered reflection coach guiding you through structured reflections on your learning and practice experiences.</p>
            <p><strong>Important:</strong> VoxaReflect is a technical tool and does not replace teachers, counselors, or professional support. Responses are automatically generated and the system has no feelings or consciousness.</p>
            <p>Browse past reflections in the left column. The plus button (+) starts a new reflection. Top right: the book icon opens the guide, the question mark shows this help.</p>
            <p><strong>Privacy:</strong> Your reflections are stored for later access. Content is sent to OpenAI for AI processing. For personal or distressing topics, reach out to friends, teachers, or counseling services.</p>
          </>
        );
    }
    if (helpDialogTab === "chat") {
      return language == "de"
        ? (
          <>
            <h3>{chatHeader}</h3>
            <ul>
              <li><strong>Spracheingabe:</strong> Drücke den Mikrofon-Button und sprich deine Antwort. Die Aufnahme wird in Text umgewandelt.</li>
              <li><strong>Ausgabe (TTS):</strong> "Nur Text" zeigt Antworten als Text. "Vorlesen" liest sie mit synthetischer Stimme vor.</li>
              <li><strong>Stil:</strong> "Warm" ist ermutigend und persönlich, "Professional" ist sachlich und direkt. Die Info-Symbole erklären die Unterschiede.</li>
              <li><strong>Stimme:</strong> Wähle die synthetische Stimme für das Vorlesen. Jede Reflexion speichert ihre Einstellung.</li>
              <li><strong>Phasen-Tempo:</strong> Steuert, wie viele Rückfragen pro Reflexionsphase gestellt werden (Kurz/Standard/Lang).</li>
            </ul>
            <p>Diese Einstellungen gelten pro Reflexion und helfen dir, Tempo und Ton des Coachings zu steuern.</p>
          </>
        )
        : (
          <>
            <h3>{chatHeader}</h3>
            <ul>
              <li><strong>Voice input:</strong> Press the microphone button and speak your response.</li>
              <li><strong>Output (TTS):</strong> "Text only" shows text, "Read aloud" plays a synthetic voice.</li>
              <li><strong>Style:</strong> "Warm" feels encouraging, "Professional" stays concise.</li>
              <li><strong>Voice:</strong> Pick the synthetic narrator for spoken answers. Each reflection remembers its setting.</li>
              <li><strong>Phase pacing:</strong> Controls how many prompts occur per reflection phase (Short/Standard/Long).</li>
            </ul>
            <p>Adjust these settings per reflection to match the support you need.</p>
          </>
        );
    }
    if (helpDialogTab === "model") {
      return language == "de"
        ? (
          <>
            <h3>{modelHeader}</h3>
            <p>VoxaReflect nutzt den <strong>Gibbs-Reflexionszyklus</strong> – ein bewährtes Modell, das dich von der Beschreibung über die Analyse bis zum Aktionsplan führt.</p>
            <h4>Die 6 Phasen:</h4>
            <ul>
              <li><strong>1. Beschreibung:</strong> Was ist passiert? (Fakten, noch keine Bewertung)</li>
              <li><strong>2. Gefühle:</strong> Wie hast du dich gefühlt? Was ging dir durch den Kopf?</li>
              <li><strong>3. Evaluation:</strong> Was war gut, was schwierig?</li>
              <li><strong>4. Analyse:</strong> Warum ist es so gelaufen? Welche Erfahrungen passen dazu?</li>
              <li><strong>5. Schlussfolgerung:</strong> Was lernst du daraus? Was würdest du generell anders machen?</li>
              <li><strong>6. Aktionsplan:</strong> Welche konkreten Schritte probierst du beim nächsten Mal?</li>
            </ul>
            <p>So gelangst du von reiner Beschreibung zu Analyse und Maßnahmen. Der Assistent zeigt dir immer, in welcher Phase du dich befindest.</p>
          </>
        )
        : (
          <>
            <h3>{modelHeader}</h3>
            <p>VoxaReflect uses the <strong>Gibbs Reflective Cycle</strong> – a proven model guiding you from description through analysis to an action plan.</p>
            <h4>The 6 phases:</h4>
            <ul>
              <li><strong>1. Description:</strong> What happened? (Facts only)</li>
              <li><strong>2. Feelings:</strong> How did you feel? What went through your mind?</li>
              <li><strong>3. Evaluation:</strong> What worked well, what was difficult?</li>
              <li><strong>4. Analysis:</strong> Why did it unfold this way? Which experiences or knowledge apply?</li>
              <li><strong>5. Conclusion:</strong> What do you take away? What would you generally change?</li>
              <li><strong>6. Action plan:</strong> What concrete steps will you try next time?</li>
            </ul>
            <p>This structure moves you beyond description toward analysis and action. The assistant keeps you informed about the current phase.</p>
          </>
        );
    }
    return null;
  };
  const getCurrentEditorPlainText = () => {
    const textEditor = document.getElementById("text-editor");
    if (textEditor != undefined && textEditor != null) {
      return textEditor.innerHTML.replace(/<\/?[^>]+(>|$)/g, "");
    }
    return "";
  };

  const buildChatRequestPayload = (messageText) => {
    return {
      "username": username,
      "conversationID": selectedConversation == null ? -1 : selectedConversation["id"],
      "newMessage": messageText,
      "currentText": "" + getCurrentEditorPlainText(),
      "studyGroup": studyGroup,
      "language": language,
      "mic": (shouldHaveMic ? "1" : "0"),
      "avatar": (shouldHaveAvatar ? "1" : "0"),
      "stylePreset": getTtsSettingsForConversation(selectedConversation).stylePreset,
      "ttsVoice": getTtsSettingsForConversation(selectedConversation).ttsVoice,
      "turnPreset": getTurnPresetForConversation(selectedConversation)
    };
  };

  const startRecording = async (field) => {
    if (!stream) {
      alert(language == "de" ? "Das Mikrofon ist nicht bereit. Bitte erlaube den Zugriff und versuche es erneut." : "Microphone is not ready. Please allow access and try again.");
      return;
    }
    setRecordingStatus("recording-" + field);
    try {
      //create new Media recorder instance using the stream
      const media = new MediaRecorder(stream, { type: mimeType });
      //set the MediaRecorder instance to the mediaRecorder ref
      mediaRecorder.current = media;
      //invokes the start method to start the recording process
      mediaRecorder.current.start();
      startAudioLevelMonitor(stream);
      let localAudioChunks = [];
      mediaRecorder.current.ondataavailable = (event) => {
        if (typeof event.data === "undefined") return;
        if (event.data.size === 0) return;
        localAudioChunks.push(event.data);
      };
      setAudioChunks(localAudioChunks);
    } catch (error) {
      console.log("MediaRecorder error", error);
      setRecordingStatus("inactive");
      alert(language == "de" ? "Aufnahme konnte nicht gestartet werden." : "Could not start recording.");
    }
  };

  const stopRecording = (field) => { // field == chat / editor
    stopAudioLevelMonitor();
    setRecordingStatus("inactive");
    if (!mediaRecorder.current) {
      return;
    }
    mediaRecorder.current.stop();
    mediaRecorder.current.onstop = () => {
      const recordedChunks = Array.isArray(audioChunks) ? [...audioChunks] : [];
      setAudioChunks([]);
      if (recordedChunks.length === 0) {
        setLoadingIndicatorOpen(false);
        alert(language == "de" ? "Die Aufnahme enthält keine Daten. Bitte versuche es erneut." : "The recording did not capture any data. Please try again.");
        return;
      }
      const audioBlob = new Blob(recordedChunks, { type: mimeType });
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudio(audioUrl);
      setLoadingIndicatorOpen(true);
      setTimeout(() => {
        if (field === "chat") {
          startVoiceJobUpload(audioBlob);
        } else {
          sendAudioForTranscription(audioBlob, field);
        }
      }, 300);
    };
  };

  const sendAudioForTranscription = (audioBlob, field) => {
    var data = new FormData();
    data.append('file', audioBlob, 'file');
    data.append('language', language);
    fetch(serverURL + "uploadAudio", {
      method: "POST",
      body: data
    })
      .then(response => response.json())
      .then(json => {
        setLoadingIndicatorOpen(false);
        if (json["success"] != true) {
          console.log(json);
          alert(language == "de" ? "Ein Fehler ist aufgetreten; bitte versuche es noch einmal..." : "An error occurred; please try again...");
          return;
        }
        const outputText = json["result"];
        if (field === "chat") {
          const trimmedExisting = (newMessageInTextBox || "").trim();
          const combined = (trimmedExisting === "" ? outputText : `${trimmedExisting} ${outputText}`).trim();
          setNewMessageInTextBox(combined);
          if (selectedConversation != null && combined !== "") {
            setTimeout(() => {
              sendNewMessage(combined, selectedConversation);
            }, 50);
          }
        } else {
          const textEditor = document.getElementById("text-editor");
          if (textEditor != undefined && textEditor != null) {
            textEditor.innerHTML = "" + textEditor.innerHTML + " " + outputText;
            setNumberOfWords(textEditor.innerHTML.split(" ").filter((word) => { return word.trim() != ""; }).length);
            setHaveUsedMic(true);
          }
        }
      })
      .catch(error => {
        setLoadingIndicatorOpen(false);
        alert(language == "de" ? "Ein Fehler ist aufgetreten; bitte versuche es noch einmal..." : "An error occurred; please try again...");
        console.log(error);
      });
  };

  const handleVoiceJobFailure = (message) => {
    clearVoiceJobTimeouts();
    setLoadingIndicatorOpen(false);
    alert(message);
  };

  const pollVoiceJobStatus = (jobId, attempt) => {
    const normalizedAttempt = typeof attempt === "number" ? attempt : 0;
    const voiceJobStatusUrl = `${serverURL}voiceJobStatus?jobId=${encodeURIComponent(jobId)}`;
    fetch(voiceJobStatusUrl, {
      method: "GET"
    })
      .then((response) => response.json())
      .then((data) => {
        if (data["success"] !== true) {
          handleVoiceJobFailure(language == "de" ? "Die Sprachantwort konnte nicht verarbeitet werden. Bitte versuche es erneut." : "We couldn't process your voice message. Please try again.");
          return;
        }
        const status = (data["status"] || "").toLowerCase();
        if (status === "completed") {
          clearVoiceJobTimeouts();
          const payload = data["result"] || {};
          const userMessage = payload["userMessage"] || payload["transcript"] || "";
          processChatResponseData(payload, userMessage, false);
        } else if (status === "failed") {
          const errorMessage = data["error"] || (language == "de" ? "Die Sprachantwort konnte nicht verarbeitet werden. Bitte versuche es erneut." : "We couldn't process your voice message. Please try again.");
          handleVoiceJobFailure(errorMessage);
        } else {
          if (normalizedAttempt >= VOICE_JOB_MAX_POLLS) {
            handleVoiceJobFailure(language == "de" ? "Die Verarbeitung dauert ungewöhnlich lange. Bitte versuche es erneut." : "Processing is taking too long. Please try again.");
            return;
          }
          const timeoutId = setTimeout(() => {
            pollVoiceJobStatus(jobId, normalizedAttempt + 1);
          }, VOICE_JOB_POLL_INTERVAL_MS);
          voiceJobTimeoutsRef.current.push(timeoutId);
        }
      })
      .catch((error) => {
        console.log("Voice job poll error", error);
        handleVoiceJobFailure(language == "de" ? "Die Sprachantwort konnte nicht verarbeitet werden. Bitte versuche es erneut." : "We couldn't process your voice message. Please try again.");
      });
  };

  const startVoiceJobUpload = (audioBlob) => {
    const metadata = buildChatRequestPayload("");
    delete metadata["newMessage"];
    var data = new FormData();
    data.append('file', audioBlob, 'file');
    data.append('metadata', JSON.stringify(metadata));
    clearVoiceJobTimeouts();
    fetch(serverURL + "uploadAudio", {
      method: "POST",
      body: data
    })
      .then((response) => response.json())
      .then((json) => {
        if (json["success"] !== true || !json["jobId"]) {
          console.log(json);
          setLoadingIndicatorOpen(false);
          alert(language == "de" ? "Die Aufnahme konnte nicht verarbeitet werden. Bitte versuche es erneut." : "We couldn't process the recording. Please try again.");
          return;
        }
        pollVoiceJobStatus(json["jobId"], 0);
      })
      .catch((error) => {
        console.log("Voice upload error", error);
        setLoadingIndicatorOpen(false);
        alert(language == "de" ? "Die Aufnahme konnte nicht verarbeitet werden. Bitte versuche es erneut." : "We couldn't process the recording. Please try again.");
      });
  };

  const getMicrophonePermission = async () => {
      if ("MediaRecorder" in window) {
          try {
              const streamData = await navigator.mediaDevices.getUserMedia({
                  audio: true,
                  video: false,
              });
              setPermission(true);
              setStream(streamData);
          } catch (err) {
              alert(err.message);
          }
      } else {
          alert("The MediaRecorder API is not supported in your browser.");
      }
  };

  React.useEffect(() => {
    setPastConversationsVisible(greaterThanLarge);
    if (shouldHaveMic && !permission) {
      getMicrophonePermission();
    }
  }, []);

  React.useEffect(() => {
    return () => {
      stopAudioLevelMonitor();
    };
  }, [stopAudioLevelMonitor]);

  React.useEffect(() => {
    if (selectedConversation == null || selectedConversation["id"] == undefined || selectedConversation["id"] == null) {
      return;
    }
    const conversationId = selectedConversation["id"];
    setConversationTtsSettings((prev) => {
      if (prev[conversationId]) {
        return prev;
      }
      return {
        ...prev,
        [conversationId]: buildDefaultTtsSettings()
      };
    });
  }, [selectedConversation, buildDefaultTtsSettings]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.setItem(TTS_SESSION_KEY, ttsPreference);
    if (ttsPreference === "text") {
      stopAnyTtsPlayback();
    }
  }, [ttsPreference, stopAnyTtsPlayback]);

  React.useEffect(() => {
    if (!Array.isArray(conversations)) {
      return;
    }
    setConversationTurnPresets((prev) => {
      let changed = false;
      const next = { ...prev };
      conversations.forEach((conversation) => {
        if (!conversation || conversation["id"] == undefined || conversation["id"] == null) {
          return;
        }
        const resolvedPreset = TURN_PRESET_VALUE_SET.has(conversation["turnPreset"])
          ? conversation["turnPreset"]
          : TURN_PRESET_DEFAULT;
        if (next[conversation["id"]] !== resolvedPreset) {
          next[conversation["id"]] = resolvedPreset;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [conversations]);

  React.useEffect(() => {
    let isCancelled = false;
    fetch(serverURL + "tts/config", {
      method: "GET"
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load TTS config");
        }
        return response.json();
      })
      .then((data) => {
        if (isCancelled) {
          return;
        }
        if (Array.isArray(data["allowedVoices"]) && data["allowedVoices"].length > 0) {
          applyAllowedVoicesFromServer(data["allowedVoices"]);
        }
      })
      .catch(() => {
        // Config fetch failures should not block the UI; keep defaults.
      });
    return () => {
      isCancelled = true;
    };
  }, [applyAllowedVoicesFromServer]);

  React.useEffect(() => {
    if (pendingTts == null) {
      return;
    }
    const shouldPlayAudio = pendingTts["enabled"] === true && ttsPreference === "voice";
    if (!shouldPlayAudio) {
      setPendingTts(null);
      return;
    }
    const rawUrl = pendingTts["audioUrl"];
    if (!rawUrl || rawUrl === "") {
      setPendingTts(null);
      return;
    }
    stopAnyTtsPlayback();
    const serverBase = serverURL.endsWith("/") ? serverURL.slice(0, -1) : serverURL;
    const resolvedUrl = rawUrl.startsWith("http") ? rawUrl : `${serverBase}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    try {
      const audioElement = new Audio(resolvedUrl);
      audioElement.playbackRate = ttsPlaybackRate;
      ttsAudioRef.current = audioElement;
      setIsTtsPlaying(true);
      audioElement.play().catch((error) => {
        console.log("TTS playback error", error);
        stopAnyTtsPlayback();
      });
      audioElement.onended = () => {
        stopAnyTtsPlayback();
      };
      audioElement.onerror = (error) => {
        console.log("TTS playback error", error);
        stopAnyTtsPlayback();
      };
    } catch (error) {
      console.log("TTS playback error", error);
      stopAnyTtsPlayback();
    }
    setPendingTts(null);
  }, [pendingTts, ttsPreference, stopAnyTtsPlayback, ttsPlaybackRate]);

  React.useEffect(() => {
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.playbackRate = ttsPlaybackRate;
      } catch (error) {
        console.log("TTS playback rate sync failed", error);
      }
    }
  }, [ttsPlaybackRate]);

  React.useEffect(() => {
    return () => {
      stopAnyTtsPlayback();
    };
  }, [stopAnyTtsPlayback]);

  React.useEffect(() => {
    return () => {
      clearVoiceJobTimeouts();
    };
  }, [clearVoiceJobTimeouts]);

  const handleOpenUserInfoDialog = () => { setUserInfoDialogOpen(true); };
  const handleCloseUserInfoDialog = () => { setUserInfoDialogOpen(false); };
  const handleOpenInformationDialog = () => { setInformationDialogOpen(true); };
  const handleCloseInformationDialog = () => { setInformationDialogOpen(false); };
  const handleOpenHelpDialog = () => { setHelpDialogTab("overview"); setHelpDialogOpen(true); };
  const handleCloseHelpDialog = () => { setHelpDialogOpen(false); };
  const handleHelpTabChange = (_, newValue) => { setHelpDialogTab(newValue); };
  const handleOpenGuideDialog = () => { setGuideDialogOpen(true); };
  const handleCloseGuideDialog = () => { setGuideDialogOpen(false); };

  const handleOpenSpecifityWhyDialog = () => { setSpecifityWhyDialogOpen(true); };
  const handleCloseSpecifityWhyDialog = () => { setSpecifityWhyDialogOpen(false); };
  const handleStylePresetChange = (newValue) => {
    updateTtsSettingsForConversation(selectedConversation, { stylePreset: newValue });
  };
  const handleTtsVoiceChange = (newValue) => {
    updateTtsSettingsForConversation(selectedConversation, { ttsVoice: newValue });
  };
  const handleTurnPresetChange = (newValue) => {
    const normalized = TURN_PRESET_VALUE_SET.has(newValue) ? newValue : TURN_PRESET_DEFAULT;
    if (!selectedConversation || selectedConversation["id"] == undefined || selectedConversation["id"] == null) {
      return;
    }
    const conversationId = selectedConversation["id"];
    persistTurnPresetLocally(conversationId, normalized);
    setSelectedConversation((prev) => {
      if (!prev || prev["id"] !== conversationId) {
        return prev;
      }
      return {
        ...prev,
        turnPreset: normalized
      };
    });
    fetch(serverURL + "updateTurnPreset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        "username": username,
        "conversationID": conversationId,
        "turnPreset": normalized
      })
    })
      .then((response) => response.json())
      .then((data) => {
        if (data["success"] !== true) {
          console.log("Failed to update turn preset", data);
        }
      })
      .catch((error) => {
        console.log("Error updating turn preset", error);
      });
  };

  const getWidthOfChat = () => {
    if (studyGroup == "1") {
      return 9.6;
    }
    if (visibilityStatus == "chat") {
      return 9.6;
    } else if (visibilityStatus == "editor") {
      return 0;
    } else if (visibilityStatus == "both") {
      return 4.8;
    }
    return 0;
  }

  const getWidthOfEditor = () => {
    if (studyGroup == "2") return 4.8;
    if (visibilityStatus == "editor") {
      return 9.6;
    } else if (visibilityStatus == "chat") {
      return 0;
    } else if (visibilityStatus == "both") {
      return 4.8;
    }
    return 0;
  }

  const setConversationsAccordingToSelectedConversation = (newSelectedConversation) => {
    let newConversations = conversations;
    let hasModified = false;
    for (let i = 0; i < newConversations.length; i++) {
      if (newConversations[i]["id"] == newSelectedConversation["id"]) {
        newConversations[i] = newSelectedConversation;
        hasModified = true;
        break;
      }
    }
    if (!hasModified) {
      newConversations.push(newSelectedConversation);
    }
    newConversations = newConversations.sort((a, b) => { return b["id"] - a["id"]; });
    setConversations(newConversations);
    if (newSelectedConversation && newSelectedConversation["id"] != undefined) {
      const resolvedPreset = TURN_PRESET_VALUE_SET.has(newSelectedConversation["turnPreset"])
        ? newSelectedConversation["turnPreset"]
        : TURN_PRESET_DEFAULT;
      persistTurnPresetLocally(newSelectedConversation["id"], resolvedPreset);
    }
  }

  const addChatToConversation = (userMessage, systemMessage, buttons, selectedConversation) => {
    setLoadingIndicatorOpen(true);
    fetch(serverURL + "addChatToConversation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        "username": username,
        "conversationID": selectedConversation == null ? -1 : selectedConversation["id"],
        "newMessageUser": userMessage,
        "newMessageSystem": systemMessage,
        "buttons": buttons,
        "language": language
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data["success"] == true) {
          setTimeout(() => {
            let result = data["result"];
            const newMessageInTextBox = "" + userMessage;
            const baseConversation = selectedConversation ? selectedConversation : { "messages": [], "summary": null, "phase": null };
            const previousMessages = Array.isArray(baseConversation["messages"]) ? baseConversation["messages"] : [];
            const updatedPhase = (data["phase"] != undefined && data["phase"] != null) ? data["phase"] : baseConversation["phase"];
            const assistantMessages = [
              { "sender": "system", "content": result, "buttons": data["buttons"], "video": data["video"] }
            ];
            const resolvedTurnPresetFromServer = TURN_PRESET_VALUE_SET.has(data["turnPreset"])
              ? data["turnPreset"]
              : getTurnPresetForConversation(baseConversation);
            const newSelectedConversation = applySummaryToConversation({
              ...baseConversation,
              "id": data["id"],
              "title": data["title"],
              "text": data["text"],
              "stage": data["stage"],
              "time": data["time"],
              "turnPreset": resolvedTurnPresetFromServer,
              "phase": updatedPhase,
              "summary": data["reflectionSummary"] ? data["reflectionSummary"] : baseConversation["summary"],
              "messages": [
                ...previousMessages,
                { "sender": "user", "content": newMessageInTextBox, "buttons": [], "video": "" },
                ...assistantMessages
              ]
            });
            setSelectedConversation(newSelectedConversation);
            persistTurnPresetLocally(data["id"], resolvedTurnPresetFromServer);
            setTimeout(() => {
              setConversationsAccordingToSelectedConversation(newSelectedConversation);
              setTimeout(() => {
                const ichBinBereitMessage = language == "de" ? "Ich bin bereit, mit den Überlegungen zu beginnen." : "I am ready to start reflective writing.";
                if (newMessageInTextBox == ichBinBereitMessage || isACertainMessageInConversation(ichBinBereitMessage, newSelectedConversation)) {
                  setTimeout(() => {
                    setVisibilityStatus("both");
                    const numberOfWords = newSelectedConversation["text"].split(" ").filter((word) => { return word.trim() != ""; }).length
                    setNumberOfWords(numberOfWords);
                    setHaveUsedMic(numberOfWords > 0);
                  }, 100);
                } else {
                  setTimeout(() => {
                    setVisibilityStatus("chat");
                  }, 100);
                }
                setNewMessageInTextBox("");
                setTimeout(() => {
                  const scrollView = document.getElementById("main-page-conversation-messages");
                  if (scrollView != undefined && scrollView != null) scrollView.scrollTop = scrollView.scrollHeight;
                  setLoadingIndicatorOpen(false);
                }, 100);
              }, 100);
            }, 100);
          }, 1500);
        } else {
          setLoadingIndicatorOpen(false);
          alert(language == "de" ? "Ein Fehler ist aufgetreten. Bitte versuche es noch einmal" : "An error occurred. Please try again");
        }
      })
      .catch(error => {
        setLoadingIndicatorOpen(false);
        console.log(error);
        alert(language == "de" ? "Ein Fehler ist aufgetreten. Bitte versuche es noch einmal" : "An error occurred. Please try again");
      });
  }

  const processChatResponseData = (data, fallbackUserMessage, shouldPopulateFeedbackArea) => {
    if (data["success"] !== true) {
      setLoadingIndicatorOpen(false);
      alert(language == "de" ? "Ein Fehler ist aufgetreten. Bitte versuche es noch einmal..." : "An error occurred. Please try again...");
      return;
    }
    setTimeout(() => {
      hasCreatedNewConversation = false;
      const result = data["result"];
      const resolvedUserMessageRaw = (data["userMessage"] != undefined && data["userMessage"] != null)
        ? data["userMessage"]
        : (fallbackUserMessage || "");
      const resolvedUserMessage = "" + resolvedUserMessageRaw;
      const updatedPhase = (data["phase"] != undefined && data["phase"] != null) ? data["phase"] : (selectedConversation == null ? null : selectedConversation["phase"]);
      const previousMessages = selectedConversation && Array.isArray(selectedConversation["messages"]) ? selectedConversation["messages"] : [];
      const assistantMessages = [
        { "sender": "system", "content": result, "buttons": data["buttons"], "video": data["video"] }
      ];
      const conversationSummary = data["reflectionSummary"] ? data["reflectionSummary"] : (selectedConversation ? selectedConversation["summary"] : null);
      const resolvedTurnPresetFromServer = TURN_PRESET_VALUE_SET.has(data["turnPreset"])
        ? data["turnPreset"]
        : getTurnPresetForConversation(selectedConversation);
      const newSelectedConversation = applySummaryToConversation({
        ...(selectedConversation || { "messages": [] }),
        "id": data["id"],
        "title": data["title"],
        "text": data["text"],
        "stage": data["stage"],
        "time": data["time"],
        "turnPreset": resolvedTurnPresetFromServer,
        "phase": updatedPhase,
        "summary": conversationSummary,
        "messages": [
          ...previousMessages,
          { "sender": "user", "content": resolvedUserMessage, "buttons": [], "video": "" },
          ...assistantMessages
        ]
      });
      setSelectedConversation(newSelectedConversation);
      persistTurnPresetLocally(data["id"], resolvedTurnPresetFromServer);
      if (shouldPopulateFeedbackArea === true) {
        setFeedbackText(result.replaceAll("\n", "<br />"));
      }
      setTimeout(() => {
        setConversationsAccordingToSelectedConversation(newSelectedConversation);
        setTimeout(() => {
          const ichBinBereitMessage = language == "de" ? "Ich bin bereit, mit den Überlegungen zu beginnen." : "I am ready to start reflective writing.";
          if (studyGroup == "2" || resolvedUserMessage == ichBinBereitMessage || isACertainMessageInConversation(ichBinBereitMessage, newSelectedConversation)) {
            setTimeout(() => {
              setVisibilityStatus("both");
              setNumberOfWords(newSelectedConversation["text"].split(" ").filter((word) => { return word.trim() != ""; }).length);
            }, 100);
          } else {
            setTimeout(() => {
              setVisibilityStatus("chat");
            }, 100);
          }
          setNewMessageInTextBox("");
          setTimeout(() => {
            const scrollView = document.getElementById("main-page-conversation-messages");
            if (scrollView != undefined && scrollView != null) scrollView.scrollTop = scrollView.scrollHeight;
            setLoadingIndicatorOpen(false);
            const ttsPayload = data["tts"] || null;
            if (ttsPayload) {
              setLastTtsMetadata({
                stylePreset: ttsPayload["stylePreset"] || "",
                voice: ttsPayload["voice"] || ""
              });
              if (Array.isArray(ttsPayload["allowedVoices"]) && ttsPayload["allowedVoices"].length > 0) {
                applyAllowedVoicesFromServer(ttsPayload["allowedVoices"]);
              }
            }
            setPendingTts(ttsPayload);
          }, 100);
        }, 100);
      }, 100);
    }, 1500);
  };

  const sendNewMessage = (newMessageInTextBox, selectedConversation, shouldPopulateFeedbackArea) => {
    if (newMessageInTextBox === "") {
      alert(language == "de" ? "Bitte gib deine Nachricht korrekt ein." : "Please enter your message correctly.");
      return;
    }
    setLoadingIndicatorOpen(true);
    const payload = buildChatRequestPayload(newMessageInTextBox);
    fetch(serverURL + "newChat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        processChatResponseData(data, newMessageInTextBox, shouldPopulateFeedbackArea === true);
      })
      .catch(error => {
        setLoadingIndicatorOpen(false);
        console.log(error);
        alert(language == "de" ? "Ein Fehler ist aufgetreten; Bitte versuche es noch einmal..." : "An error occurred; Please try again...");
      });
  }

  const getFeedback = () => {
    const text = document.getElementById("text-editor").innerHTML.replace(/<\/?[^>]+(>|$)/g, "");
    if (text == "") {
      alert(language == "de" ? "Bitte gib deinen Text korrekt ein" : "Please enter your text correctly");
      return;
    }
    setLoadingIndicatorOpen(true);
    selectedConversation["text"] = text;
    fetch(serverURL + "getFeedbackOnReflection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        "username": username,
        "text": text,
        "stage": selectedConversation == null ? "" : selectedConversation["stage"],
        "conversationID": selectedConversation == null ? -1 : selectedConversation["id"],
        "studyGroup": studyGroup,
        "language": language
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data["success"] == true) {
          const result = data["result"];
          const buttons = data["buttons"];
          const newTitle = data["new_title"];
          const is_finished = data["is_finished"];
          setNewMessageInTextBox(text);
          setTimeout(() => {
            if (language == "de") {
              addChatToConversation('Kannst du mir Feedback zu meinem Text geben? Er lautet:\n' + text, "Feedback zu Ihrem Text:\n" + result, buttons, selectedConversation, newTitle);
            } else {
              addChatToConversation('Can you give me feedback on my text? It is:\n' + text, "Feedback on your text:\n" + result, buttons, selectedConversation, newTitle);
            }
            const feedbackText = result.replaceAll("\n", "<br />");
            setFeedbackText(feedbackText);
          }, 100);
        } else {
          setLoadingIndicatorOpen(false);
          alert(language == "de" ? "Ein Fehler ist aufgetreten. Bitte versuche es noch einmal...." : "An error occurred. Please try again....");
        }
      })
      .catch(error => {
        console.log(error);
        setLoadingIndicatorOpen(false);
        alert(language == "de" ? "Ein Fehler ist aufgetreten; bitte versuche es noch einmal..." : "An error occurred; please try again...");
      });
  }

  const addNewConversation = () => {
    const textEditor = document.getElementById("text-editor");
    if (textEditor != undefined && textEditor != null) {
      textEditor.innerHTML = "";
      setNumberOfWords(0);
      setFeedbackText("");
    }
    if (!hasCreatedNewConversation) {
      hasCreatedNewConversation = true;
      const laufende = language == "de" ? "Laufende Reflexion" : "Ongoing Reflection";
      const newConversationId = conversations.length;
      let newConversations = ([...conversations, { "id": newConversationId, "title": laufende, "messages": [], "phase": null, "turnPreset": TURN_PRESET_DEFAULT }]).sort((a, b) => { return b["id"] - a["id"]; });
      setConversations(newConversations);
      setConversationTtsSettings((prev) => ({
        ...prev,
        [newConversationId]: buildDefaultTtsSettings()
      }));
      setConversationTurnPresets((prev) => ({
        ...prev,
        [newConversationId]: TURN_PRESET_DEFAULT
      }));
      setTimeout(() => {
        setSelectedConversation(newConversations[0]);
        hasCreatedNewConversation = false;
        setTimeout(() => {
          if (!greaterThanLarge) setPastConversationsVisible(false);
        }, 100);
      }, 100);
    } else {
      setSelectedConversation(conversations[0]);
    }
  }

  const isACertainMessageInConversation = (message, conversation) => {
    for (let i = 0; i < conversation["messages"].length; i++) {
      if (conversation["messages"][i]["content"] == message) {
        return true;
      }
    }
    return false;
  }

  const gibMirText = language == "de" ? "Gib mir einige praktische Ideen, wie ich mit dem Schreiben meines reflektierenden Textes nach dem Gibbs-Modell beginnen kann." : "Give me some practical ideas on how to start writing my reflective text using the Gibbs model.";

  return (
    <>
      <div className="main-page-title">
        <span className='main-title-left'>
          <img src={voxareflectLogo} className='main-title-logo' alt="VoxaReflect" />
          <span><b>VoxaReflect</b>&nbsp;&nbsp;&nbsp;&nbsp;Welcome, {username}!</span>
        </span>
        <span>
          <span className='span-theme-toggle'>
            <button className='theme-toggle-button' onClick={onToggleTheme}>{themeToggleLabel}</button>
          </span>

          {studyGroup == "2" &&
            <span className='span-including-guide-button'>
              <HtmlTooltip title={
                <>
                  {language == "de" && <h3>Klicke hier, um den Leitfaden zum reflektierenden Schreiben und zum Gibbs-Reflexionszyklus anzuzeigen.</h3>}
                  {language == "en" && <h3>Click here to view the guide on reflective writing and the Gibbs Reflective Cycle.</h3>}
                </>
              }
              ><span ><MenuBookIcon className='icon-clickable' onClick={() => { handleOpenGuideDialog(); }} /></span></HtmlTooltip>
            </span>
          }


          <span className='span-including-help-button'>
            <HtmlTooltip title={
              <>
                {language == "de" && <h3>Klicke hier, um die Hilfe des Systems anzuzeigen.</h3>}
                {language == "en" && <h3>Click here to view the help of the system.</h3>}
              </>
            }
            ><span ><HelpIcon className='icon-clickable' onClick={() => { handleOpenHelpDialog(); }} /></span></HtmlTooltip>
          </span>

          

        </span>
      </div>
      <div className="main-page-container">
        <div className='ai-transparency-hint'>
          <InfoOutlinedIcon fontSize='small' className='ai-transparency-hint-icon' />
          <span>{aiTransparencyHintText}</span>
        </div>
        {renderTtsControls()}
        <div className='main-page-grid-wrapper'>
          <Grid container spacing={0.25} className='main-page-grid'>

          {pastConversationsVisible && <Grid item  xs={2.4} className='grid-column'>
            <div className="main-page-conversations">
              <div className='past-conversations-title-and-icon-container'>
                {language == "de" && <h2 className='past-conversations-title'>Alle Reflexionen</h2>}
                {language == "en" && <h2 className='past-conversations-title'>All Reflections</h2>}
                <span className='add-icon'><HtmlTooltip title={
                  <>
                    {language == "de" && <h3>{studyGroup == "1" ? "Beginne ein neues Gespräch" : "Beginne mit einem neuen Schreiben"}</h3>}
                    {language == "en" && <h3>{studyGroup == "1" ? "Start a new conversation" : "Start a new writing"}</h3>}
                  </>
                }
                ><span ><AddIcon className="moved-help-icon-small" onClick={() => {
                  addNewConversation();
                }} /></span></HtmlTooltip></span>
              </div>
              <div className="main-page-conversations-list">
                {language == "de" && conversations.length == 0 && <div style={{margin: 10, fontSize: '105%', lineHeight: '150%'}}>
                  {studyGroup == "1" ? "Klicke oben auf die Plus-Schaltfläche (+), um ein Gespräch zu beginnen!" : "Klicke oben auf die Plus-Schaltfläche (+), um mit dem Schreiben zu beginnen!"}
                </div>}
                {language == "en" && conversations.length == 0 && <div style={{margin: 10, fontSize: '105%', lineHeight: '150%'}}>
                  {studyGroup == "1" ? "Click on the plus button (+) above to start a conversation!" : "Click on the plus button (+) above to start writing!"}
                </div>}
                {conversations.map((conversation, index) => {
                  const phase = conversation["phase"];
                  const phaseTimeline = renderConversationPhaseTimeline(phase);
                  return (
                    <div className={"main-page-conversations-list-item" + ((selectedConversation != null && selectedConversation["id"] == conversation["id"]) ? " main-page-conversations-list-item-hovered-effect" : "")} key={index} onClick={() => {
                      const timerToSet = setInterval(() => {
                        let text_editor = document.getElementById("text-editor");
                        if (text_editor != undefined && text_editor != null) {
                          if (conversation["text"].trim() == "") {
                            const text = loadEditorDraft();
                            if (text != null && text != undefined && text.trim() != "") {
                              text_editor.innerHTML = text;
                              setHaveUsedMic(text.length > 0);
                              setNumberOfWords(text.split(" ").filter((word) => { return word.trim() != ""; }).length);
                            }
                          } else {
                            text_editor.innerHTML = conversation["text"];
                            setHaveUsedMic(conversation["text"].length > 0);
                            setNumberOfWords(conversation["text"].split(" ").filter((word) => { return word.trim() != ""; }).length);
                          }
                          clearTimeout(timerToSet);
                        }
                      }, 100);
                      setFeedbackText("");
                       const normalizedConversation = applySummaryToConversation(conversation);
                       setSelectedConversation(normalizedConversation);
                      const ichBinBereitMessage = language == "de" ? "Ich bin bereit, mit den Überlegungen zu beginnen." : "I am ready to start reflective writing.";
                      if (isACertainMessageInConversation(ichBinBereitMessage, conversation)) {
                        setTimeout(() => {
                          setVisibilityStatus("both");
                          setTimeout(() => {
                            if (textEditor != undefined && textEditor != null && conversation["text"].trim() != ""){
                              textEditor.innerHTML = conversation["text"];
                              setHaveUsedMic(conversation["text"].length > 0);
                              setNumberOfWords(conversation["text"].split(" ").filter((word) => { return word.trim() != ""; }).length);
                            }
                          }, 100);
                        }, 100);
                      } else {
                        setTimeout(() => {
                          setVisibilityStatus("chat");
                        }, 100);
                      }
                      const textEditor = document.getElementById("text-editor");
                      if (textEditor != undefined && textEditor != null && conversation["text"].trim() != "") {
                        textEditor.innerHTML = conversation["text"];
                        setHaveUsedMic(conversation["text"].length > 0);
                        setNumberOfWords(conversation["text"].split(" ").filter((word) => { return word.trim() != ""; }).length);
                      }
                      setTimeout(() => {
                        setNewMessageInTextBox("");
                        const scrollView = document.getElementById("main-page-conversation-messages");
                        if (scrollView != undefined && scrollView != null) scrollView.scrollTop = scrollView.scrollHeight;
                        setTimeout(() => {
                          if (!greaterThanLarge) setPastConversationsVisible(false);
                        }, 100);
                      }, 100);
                    }}>
                    <div className='conversation-list-text'>
                      {(() => {
                        const baseTitle = conversation['title'] || "";
                        const finishedTitle = language == "de" ? "Abgeschlossene Reflexion" : "Completed reflection";
                        const ongoingTitle = language == "de" ? "Laufende Reflexion" : "Ongoing reflection";
                        const displayTitle = phase != null && phase["isFinished"] ? finishedTitle : (baseTitle || ongoingTitle);
                        const dateLabel = conversation["time"] == null || (conversation["time"] == undefined)
                          ? new Date().toLocaleString(undefined, { month: "short", day: "numeric" })
                          : new Date(conversation["time"] * 1000).toLocaleString(undefined, { month: "short", day: "numeric" });
                        return (
                          <h4>{displayTitle}, {dateLabel}</h4>
                        );
                      })()}
                      {phase != null &&
                        <div className='conversation-phase-caption'>
                          <span>{language == "de" ? "Fortschritt der Reflektions-Phasen" : "Reflection phase progress"}</span>
                          <InfoOutlinedIcon
                            fontSize='small'
                            className='phase-caption-help-icon'
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenHelpDialog();
                              setHelpDialogTab("model");
                            }}
                          />
                        </div>
                      }
                      {phaseTimeline}
                    </div>
                      <span className="right-icon-container"><ChevronRightIcon /></span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Grid>}

          {selectedConversation != null && <>

            {studyGroup == "1" && visibilityStatus != "editor" && <Grid className="animated grid-column" item xs={getWidthOfChat()}>
              <div className="middle-container-main-page">
                <div className="main-page-conversation">
                  <div className="main-page-conversation-messages" id="main-page-conversation-messages">
                    { /* https://stackoverflow.com/a/71155446 */}
                    {selectedConversation != null && (<div class="chat">
                      {selectedConversation["messages"].length === 0 &&
                        <div
                          className='chat-instruction-banner'
                          style={{ fontSize: greaterThanLarge ? '95%' : '80%', marginBottom: '16px', padding: '12px 16px', backgroundColor: '#f5f5f5', borderRadius: '10px', color: '#333' }}
                        >
                          {getChatInstruction(language)}
                        </div>
                      }
                      {renderSessionCompleteNotice()}
                      {selectedConversation["messages"].map((message, index) => {
                        const dataTime = message.sender == "system" ? "VoxaReflect" : "" + username;
                        const className = message.sender == "system" ? "msg rcvd" : "msg sent";
                        const formattedMessageText = message["content"].replaceAll("qqqqqqqqqqqqqqq", 'friend');
                        // const replacedContentWithNewline = formattedMessageText.replace(/<br>/g, "\n");
                        let replacedContentWithNewline = formattedMessageText.replaceAll("\n\n", "\n");
                        replacedContentWithNewline = replacedContentWithNewline.replaceAll("\n", "<br /><br />").replaceAll("Feedback zu Ihrem Text:", "<b>Feedback zu Ihrem Text:</b>").replaceAll("Feedback on your text:", "<b>Feedback on your text:</b>").replaceAll("Ideen für reflektierendes Schreiben:", "<b>Ideen für reflektierendes Schreiben:</b>").replaceAll("Ideas for reflective writing:", "<b>Ideas for reflective writing:</b>").replaceAll("Kannst du mir Feedback zu meinem Text geben? Er lautet:", "<i>Kannst du mir Feedback zu meinem Text geben? Er lautet:</i>").replaceAll("Can you give me feedback on my text? It is:", "<i>Can you give me feedback on my text? It is:</i>").replaceAll("Natürlich! ", "").replaceAll("Of course! ", "");
                        const lines = [replacedContentWithNewline];
                        return (
                          <>
                          {
                            lines.map((line, index2) => (
                              <div
                                key={index * 1000 + index2}
                                data-time={dataTime}
                                class={className}
                                style={{ fontSize: greaterThanLarge ? '100%' : '75%' }}
                                dangerouslySetInnerHTML={{__html: line}}
                              ></div>
                            ))
                          }
                          {message["buttons"].length > 0 &&
                            <>
                              {language == "de" && <div className='next-suggestions-caption'>Vorschl\xe4ge f\xfcr die n\xe4chste Nachricht</div>}
                              {language == "en" && <div className='next-suggestions-caption'>Suggestions for the next message</div>}
                            </>
                          }
                          {
                            message["buttons"].map((button, index2) => {
                              return (<div key={index * 10000 + index2}>
                                <button className="main-page-conversation-message-button" style={{ fontSize: greaterThanLarge ? '90%' : '75%' }} onClick={() => {
                                  setNewMessageInTextBox(button);
                                  setTimeout(() => {
                                    sendNewMessage(button, selectedConversation);
                                  }, 100);
                                }}>✏️  {button}</button>
                              </div>);
                            })
                          }
                          {message["video"] != "" &&
                            <iframe width="340" src={message["video"]} style={{ marginTop: 10, marginBottom: 20 }}></iframe>
                          }
                          </>
                        )
                      })}
                      {language == "de" && <div className='next-suggestions-subcaption'>VoxaReflect befindet sich in der Entwicklung, kann Fehler machen und das Laden der Antworten kann lange dauern.</div>}
                      {language == "en" && <div className='next-suggestions-subcaption'>VoxaReflect is in development, can make mistakes, and loading the responses can take a long time.</div>}
                    </div>)}
                  </div>
                </div>
                <div className="main-page-conversation-new-message">
                  <div className='voice-mic-container'>
                    {shouldHaveMic &&
                      <div className='voice-mic-wrapper'>
                        <button
                          type='button'
                          className={`voice-mic-button${recordingStatus.startsWith("recording") ? " recording" : ""}`}
                          title={voiceHintLabel}
                          aria-label={voiceHintLabel}
                          onClick={() => {
                            if (recordingStatus == "inactive") {
                              startRecording("chat");
                            } else if (recordingStatus.startsWith("recording")) {
                              stopRecording("chat");
                            }
                          }}
                        >
                          {recordingStatus.startsWith("recording")
                            ? <StopIcon />
                            : <KeyboardVoiceIcon />
                          }
                        </button>
                        <span className='voice-mic-label'>{language == "de" ? "Sprachantwort" : "Voice reply"}</span>
                        {renderAudioLevelIndicator("chat")}
                      </div>
                    }
                  </div>

                  <input type="text" placeholder={language == "de" ? "Gib hier deine neue Nachricht ein..." : "Enter your new message here..."} id="main-page-conversation-new-message-textbox" value={newMessageInTextBox} onChange={(event) => { setNewMessageInTextBox(event.target.value) }} onKeyUp={(e) => {
                    if (e.key == "Enter") sendNewMessage(document.getElementById("main-page-conversation-new-message-textbox").value, selectedConversation);
                  }} />

                </div>

              </div>
            </Grid>}

            {studyGroup == "2" && <Grid className="animated grid-column" item xs={getWidthOfEditor()}>
              <div class="editor-area">
                <div class="inside-editor">
                  <div className='evaluate-panel-title-and-icon-container'>
                  </div>
                  <div className='evaluate-panel-subtitle-container'>
                    {language == "de" && <div className='evaluate-panel-subtitle'>{shouldHaveMic ? "Sprich deine Reflexion zuerst ein, bearbeite sie hier und erhalte KI-basiertes Feedback von VoxaReflect." : (studyGroup == "1" ? "Versuche jetzt, hier einen reflektierenden Text zu schreiben und erhalte KI-basiertes Feedback." : "Versuche hier einen reflektierenden Text zu schreiben und erhalte KI-basiertes Feedback.")}</div>}
                    {/* TODO: Also update the English text below for the German version... */}
                    {language == "en" && <div className='evaluate-panel-subtitle'>{shouldHaveMic ? "Recommended: record your reflection, tidy the transcript here, and then request AI feedback from VoxaReflect." : "Try to write a reflective text here and get AI feedback."}</div>}
                  </div>
                  <div className='reflection-safety-hint'>{reflectionSafetyHintText}</div>

                  <div>
                    {shouldHaveMic &&
                      <>
                        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                          <div title={voiceHintLabel} aria-label={voiceHintLabel} onClick={() => {
                            if (recordingStatus == "inactive") {
                              startRecording("editor");
                            } else if (recordingStatus.startsWith("recording")) {
                              stopRecording("editor");
                            }
                          }}>
                            {recordingStatus == "inactive" && <KeyboardVoiceIcon className="main-page-conversation-new-message-button" style={{color: 'orange'}} />}
                            {recordingStatus.startsWith("recording") && <StopIcon className="main-page-conversation-new-message-button" style={{color: 'red', opacity: (recordingStatus == "recording-editor" ? 1 : 0)}} />}
                          </div>
                          {renderAudioLevelIndicator("editor")}
                          <div className='voice-hint' style={{textAlign: 'center'}}>
                            <strong>{language == "de" ? "Sprich zuerst" : "Lead with voice"}</strong>
                            {voiceHintBody}
                          </div>
                        </div>
                        <br /><br />
                      </>
                    }
                    
                  </div>

                  

                  <div contentEditable={true} id="text-editor" style={{opacity: ((shouldHaveMic && !haveUsedMic) ? 0 : 1)}} onKeyUp={() => {
                    let arrayOfWords = document.getElementById("text-editor").innerText.split(" ");
                    // check for elements with len >= 1
                    let length = 0;
                    for (let i = 0; i < arrayOfWords.length; i++) {
                      if (arrayOfWords[i].length >= 1) {
                        length++;
                      }
                    }
                    setNumberOfWords(length);
                    persistEditorDraft(document.getElementById("text-editor").innerHTML);
                  }}></div>

                  <span className='number-of-words-container'>
                  {language == "de" ? "Anzahl der Wörter: " : "Number of words: "} {numberOfWords}
                  </span>
                  <br />
                  <span className='provide-ideas-link-container'>
                    {numberOfWords != 0 || isACertainMessageInConversation(gibMirText, selectedConversation) ? <>&nbsp;</> :
                    <>
                      {language == "de" ? "Weißt du nicht, wie du anfangen sollst? " : "Don't know how to start? "} <span className='provide-ideas-link' onClick={() => {
                        const new_message = gibMirText;
                        setNewMessageInTextBox(new_message);
                        setTimeout(() => {
                          sendNewMessage(new_message, selectedConversation, true);
                        }, 100);
                      }}>{language == "de" ? "Lass uns ein paar Ideen bekommen!" : "Let's get some ideas!"}</span>
                    </>
                    }
                  </span>
                  <br />
                  <input type="button" className='feedback-button' value={isCurrentSessionFinished ? (language == "de" ? "Reflexion abgeschlossen" : "Reflection complete") : "Feedback"} onClick={() => getFeedback()} disabled={isCurrentSessionFinished} />
                  <br />
                  {language == "de" && <span style={{textAlign: 'center'}}>Es kann <b>lange dauern</b> (mehr als 30 Sekunden), bis das Feedback angezeigt wird.</span>}
                  {language == "en" && <span style={{textAlign: 'center'}}>It may take <b>long</b> (more than 30 seconds) for the feedback to be displayed.</span>}
                </div>
              </div>
            </Grid>}


            {studyGroup == "2" && <Grid className="animated grid-column" item xs={getWidthOfEditor()}>
              <div class="editor-area">
                <div class="inside-editor">
                  <div className='evaluate-panel-title-and-icon-container'>
                  </div>
                  <div className='evaluate-panel-subtitle-container'>
                    {language == "de" && <div className='evaluate-panel-subtitle'>Feedback-Bereich</div>}
                    {language == "en" && <div className='evaluate-panel-subtitle'>Feedback Area</div>}
                  </div>

                  <div className='feedback-area-text' dangerouslySetInnerHTML={{__html: feedbackText}}>
                  </div>

                  <br /> <br />
                  {language == "de" && <div className='next-suggestions-subcaption'>VoxaReflect befindet sich in der Entwicklung, kann Fehler machen und das Laden der Antworten kann lange dauern.</div>}
                  {language == "en" && <div className='next-suggestions-subcaption'>VoxaReflect is in development, can make mistakes, and loading the responses can take a long time.</div>}

                </div>
              </div>
            </Grid>}

          </>}

          {selectedConversation == null && <Grid item xs={9.6} className='grid-column'>
            <div className="center-container">
              {language == "de" && <h2>Willkommen bei VoxaReflect!</h2>}
              {language == "en" && <h2>Welcome to VoxaReflect!</h2>}
              {language == "de" &&  <p>
                {studyGroup == "1" ? "Im linken Bereich findest du den Verlauf deiner bisherigen Gespräche mit VoxaReflect." : "Im linken Bereich findest du den Verlauf deiner bisherigen Schriften in VoxaReflect."}
              </p>}
              {language == "en" &&  <p>
                {studyGroup == "1" ? "In the left area, you can see the history of your previous conversations with VoxaReflect." : "In the left area, you can see the history of your previous writings in VoxaReflect."}
              </p>}
              <br />
              <input type="button" className='start-conversation-big-button' value={language == "de" ? "Starte eine neue Reflexion" : "Start a new reflection"} onClick={() => addNewConversation()} />
            </div>
          </Grid>}

          </Grid>
        </div>
      </div>



      <Dialog open={isUserInfoDialogOpen} onClose={handleCloseUserInfoDialog} scroll={"paper"} aria-labelledby="scroll-dialog-title" aria-describedby="scroll-dialog-description" >
        {language == "de" && <DialogTitle id="scroll-dialog-title">Benutzerbereich</DialogTitle>}
        {language == "en" && <DialogTitle id="scroll-dialog-title">User Area</DialogTitle>}
        <DialogContent dividers={true}>
          <DialogContentText
            id="scroll-dialog-description"
            tabIndex={-1} >
            <div style={{ fontSize: '105%' }}>
              {language == "de" && <p>
              Du bist derzeit als Benutzer angemeldet '<b>{username}</b>'.
              </p>}
              {language == "en" && <p>
              You are currently logged in as user '<b>{username}</b>'.
              </p>}
            </div>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          {language == "de" && <Button onClick={handleCloseUserInfoDialog}>Zurückkehren</Button>}
          {language == "en" && <Button onClick={handleCloseUserInfoDialog}>Return</Button>}
          <Button style={{ color: 'red', fontWeight: 'bold' }} onClick={() => {
            username = "";
            setCurrentPage("login");
            handleCloseUserInfoDialog();
          }}>Logout</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isInformationDialogOpen} onClose={handleCloseInformationDialog} scroll={"paper"} aria-labelledby="scroll-dialog-title" aria-describedby="scroll-dialog-description" >
        <DialogTitle id="scroll-dialog-title">Information</DialogTitle>
        <DialogContent dividers={true}>
          <DialogContentText
            id="scroll-dialog-description"
            tabIndex={-1} >
            <div style={{ fontSize: '105%' }}>
              <p>
              This is VoxaReflect.
              </p>
            </div>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseInformationDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isHelpDialogOpen}
        onClose={handleCloseHelpDialog}
        scroll={"paper"}
        aria-labelledby="scroll-dialog-title"
        aria-describedby="scroll-dialog-description"
        PaperProps={{ className: 'themed-dialog-paper' }}
      >
        {language == "de" && <DialogTitle id="scroll-dialog-title">Hilfe</DialogTitle>}
        {language == "en" && <DialogTitle id="scroll-dialog-title">Help</DialogTitle>}
        <DialogContent dividers={true}>
          <Tabs
            value={helpDialogTab}
            onChange={handleHelpTabChange}
            variant='fullWidth'
            className='help-tabs'
            aria-label='help tabs'
          >
            <Tab label={overviewTabLabel} value="overview" />
            <Tab label={chatTabLabel} value="chat" />
            <Tab label={writingTabLabel} value="model" />
          </Tabs>
          <div className='help-tab-panel' id="scroll-dialog-description">
            {renderHelpTabPanel()}
          </div>
        </DialogContent>
        <DialogActions>
          {language == "de" && <Button onClick={handleCloseHelpDialog}>Schließen</Button>}
          {language == "en" && <Button onClick={handleCloseHelpDialog}>Close</Button>}
        </DialogActions>
      </Dialog>
      <Dialog open={(studyGroup == "2") && isGuideDialogOpen} onClose={handleCloseGuideDialog} scroll={"paper"} aria-labelledby="scroll-dialog-title" aria-describedby="scroll-dialog-description" PaperProps={{
        sx: {
          minWidth: "1024px!important",
        },
      }}>
        {language == "de" && <DialogTitle id="scroll-dialog-title">Leitfaden zum reflektierenden Schreiben</DialogTitle>}
        {language == "en" && <DialogTitle id="scroll-dialog-title">Guide to Reflective Writing</DialogTitle>}
        <DialogContent dividers={true}>
          {/* TODO: Not translated to English yet! */}
          <DialogContentText
            id="scroll-dialog-description"
            tabIndex={-1} >
            <div style={{ fontSize: '105%' }}>
              <br />
              <p><b>Link zum vollständigen Leitfaden: <a target='_blank' rel='noreferrer' href='https://mindbuddy.eu.pythonanywhere.com/static/Guide.pdf'>HIER KLICKEN</a></b></p>
              <br />
              <p><b>Bitte lies diesen Leitfaden unbedingt sorgfältig durch, bevor du mit dem Nachdenken beginnst!</b></p>

              <p><b>Du kannst diesen Leitfaden jederzeit erneut aufrufen, indem du oben rechts auf das Buchsymbol klickst.</b></p>
              <br />

              <h2>Was ist reflexives Denken?</h2><p>Reflektierendes Denken ist ein Prozess, bei dem Erfahrungen, Gedanken und Gefühle untersucht und interpretiert werden, um ein tieferes Verständnis zu erlangen. Dazu gehört es, auf eine Erfahrung zurückzublicken, ihre Auswirkungen zu analysieren und zu überlegen, wie sie die eigenen Überzeugungen und Handlungen beeinflusst. Reflektiertes Denken fördert persönliches Wachstum, kritisches Denken und kontinuierliches Lernen.</p><h2>Wie kann ich den Gibbs-Reflexionszyklus nutzen?</h2><p>Der Gibbs-Reflexionszyklus besteht aus sechs Phasen:<br />Beschreibung: Dieser Abschnitt enthält eine Darstellung des Ereignisses, über das der Lernende nachdenkt.<br />Gefühle: Dieser Abschnitt enthält alle Gefühle, die die Lernenden vor, zum Zeitpunkt und nach dem Ereignis hatten sowie ihre Gedanken, als sie sich in der Situation befanden.<br />Bewertung: Dieser Abschnitt enthält eine ehrliche Meinung zu den positiven oder negativen Punkten der Antwort, die der Lernende zum Zeitpunkt der Veranstaltung gegeben hat.<br />Analyse: Dieser Abschnitt enthält mögliche Gründe für die Punkte im Abschnitt „Bewertung“ erwähnt. Die Lernenden können auf Referenzen verweisen, die die angegebenen Ursachen unterstützen, und diese in ihre Texte in diesem Abschnitt einbeziehen.<br />Schlussfolgerung: Dieser Abschnitt soll zusammenfassen, was passiert ist und was der Lernende aus der Veranstaltung gewonnen hat.<br />Aktionsplan: Dieser Abschnitt enthält Meinungen darüber, was die Der Lernende würde sich beim nächsten Mal, wenn er mit einer ähnlichen Situation konfrontiert wird, anders verhalten.</p><h2>Was sind die Vorteile des reflektierenden Denkens?</h2><p>Reflektierendes Denken bietet mehrere Vorteile, darunter:<br />1. Berufliche Weiterentwicklung und Quelle von Erkenntnissen für zukünftige Handlungen.<br />2. Die Art und Weise, wie Einzelpersonen über Dinge denken, ändert sich und führt zu Änderungen bei der Planung der nächsten Aufgaben.<br />3. Eine zentrale metakognitive Fähigkeit im beruflichen und akademischen Kontext.<br />4. Positive Auswirkungen auf die Lernergebnisse.<br />Durch den Einsatz reflektierenden Denkens können Lernende wertvolle Erkenntnisse gewinnen, die zu ihrer persönlichen und beruflichen Weiterentwicklung beitragen.</p><h2>Wie kann ich meine reflektierende Praxis effektiver gestalten?</h2><p>Um deine reflektierende Praxis zu verbessern, solltest du Folgendes in Betracht ziehen:<br />1. Sei ehrlich und offen bei der Erforschung deiner Gedanken und Gefühle.<br />2. Nimm dir regelmäßig Zeit für die Reflexion.<br />3. Hol dir Feedback von Gleichaltrigen, Mentoren oder Ausbildern.<br />4. Verwende einen strukturierten Rahmen wie den Gibbs Reflective Cycle.<br />5. Wende die aus der Reflexion gewonnenen Erkenntnisse auf zukünftige Erfahrungen an.<br />Durch die Einbeziehung dieser Strategien kannst du deine Reflexionspraxis bewusster und wirkungsvoller gestalten.</p><h2>Was sind häufige Herausforderungen beim reflektierenden Denken?</h2><p>Einige häufige Herausforderungen beim reflektierenden Denken sind: <br />1. Schwierigkeiten, Gefühle oder Gedanken klar auszudrücken.<br />2. Mangel an Zeit oder Engagement für regelmäßige Reflexion.<br />3. Widerstand, persönliche Überzeugungen oder Annahmen zu hinterfragen.<br />4. Überbetonung negativer Aspekte, ohne die positiven zu erkennen.<br />Zur Überwindung dieser Herausforderungen gehört es, ein unterstützendes Umfeld für die Reflexion zu schaffen und sich allmählich die Gewohnheit anzueignen, sich selbst sorgfältig zu prüfen.</p><h2>Wie kann ich reflektierendes Denken an verschiedene Situationen anpassen?</h2><p>Um dein reflektierendes Denken anzupassen, ist es wichtig, die einzigartigen Aspekte jeder Situation zu erkennen und den Reflexionsprozess entsprechend anzupassen. Berücksichtige den Kontext, deine Emotionen und die spezifischen Ziele deiner Reflexion. Ganz gleich, ob es sich um eine berufliche Herausforderung, eine persönliche Erfahrung oder ein akademisches Projekt handelt, die Grundsätze des reflektierenden Denkens bleiben anwendbar und bieten ein vielseitiges Werkzeug für kontinuierliches Lernen und Wachstum.</p><h2>Welche Rolle spielt die Reflexion in der beruflichen Entwicklung?</h2><p>Reflexion ist ein wesentlicher Bestandteil der beruflichen Entwicklung, da sie kontinuierliches Lernen, Anpassungsfähigkeit und Selbstverbesserung fördert. Durch die Reflexion von Erfahrungen können Fachleute Stärken, Wachstumsbereiche und Strategien zur Verbesserung ihrer Leistung erkennen. Reflektierte Praxis fördert einen proaktiven Ansatz, um sowohl aus Erfolgen als auch aus Herausforderungen zu lernen, und trägt so zu kontinuierlichem beruflichen Wachstum und Erfolg bei.</p><h2>Gib mir mehr Details über die Beschreibungsklasse des Gibbs-Reflexionszyklus.</h2><p>Die Beschreibungsklasse des Gibbs-Reflexionszyklus ist die erste Stufe des Reflexionsprozesses. Es geht darum, sich die Erfahrung im Detail ins Gedächtnis zu rufen, einschließlich des Kontexts, der beteiligten Personen und der getroffenen Maßnahmen. Diese Phase ist wichtig, um ein gemeinsames Verständnis der Erfahrung zu schaffen und die Grundlage für eine tiefergehende Reflexion zu legen. Du hilfst auch dabei, eventuelle Lücken in deinem Wissen oder Verständnis der Situation zu erkennen. Du könntest zum Beispiel ein kürzlich stattgefundenes Treffen mit einem Kollegen beschreiben und dabei den Zweck des Treffens, die besprochenen Themen und das Ergebnis nennen. Diese Beschreibung bietet einen Ausgangspunkt für weitere Überlegungen.</p><h2>Wie kann ich das Schreiben der Beschreibungsklasse verbessern?</h2><p>Um deine Beschreibung zu verbessern, solltest du Folgendes beachten:<br />1. Füge relevante Details über die Erfahrung ein.<br />2. Gib den Kontext an, um dem Leser zu helfen, die Situation zu verstehen.<br />3. Verwende eine klare und prägnante Sprache.<br />4. Vermeide Annahmen oder Verallgemeinerungen.<br />5. Konzentriere dich auf die Fakten und nicht auf deine Interpretation der Ereignisse.<br />Wenn du diese Richtlinien befolgst, kannst du eine detaillierte und genaue Beschreibung des Erlebnisses erstellen.</p><h2>Was sind einige Beispiele für gute Beschreibungen?</h2><p>Hier sind einige Beispiele für gute Beschreibungen:<br />1. Ich habe an einer Besprechung mit meinem Team teilgenommen, um das anstehende Projekt zu besprechen.<br />2. Ich habe mich mit meinem Vorgesetzten getroffen, um meine Leistungsbeurteilung zu besprechen.<br />3. Ich habe mich mit meinem Kollegen über das neue Projekt unterhalten.<br />4. Ich habe an einer Schulung zur Konfliktlösung teilgenommen.<br />5. Ich habe an einer Brainstorming-Sitzung mit meinem Team teilgenommen.<br />Diese Beschreibungen enthalten relevante Details über die Erfahrung, einschließlich des Kontexts, der beteiligten Personen und der ergriffenen Maßnahmen. Zum Beispiel, anstatt zu sagen, dass du an einer Besprechung teilgenommen hast, könntest du angeben, worum es bei der Besprechung ging.</p><h2>Was sind einige Beispiele für schlechte Beschreibungen?</h2><p>Hier sind einige Beispiele für schlechte Beschreibungen:<br />1. Ich hatte eine Besprechung mit meinem Team.<br />2. Ich habe mich mit meinem Vorgesetzten getroffen.<br />3. Ich hatte ein Gespräch mit meinem Kollegen.<br />4. Ich habe an einer Schulungsveranstaltung teilgenommen.<br />5. Ich habe an einer Brainstorming-Sitzung teilgenommen.<br />Diesen Beschreibungen fehlen relevante Details über die Erfahrung, was es schwierig macht, den Kontext oder den Zweck der Sitzung zu verstehen. Als Beispiel für eine schlechte Beschreibung, falls jemand sagt 'Ich hatte eine Besprechung mit meinem Team', könnte es schwierig sein, zu verstehen, worum es bei der Besprechung ging.</p><h2>Gib mir mehr Details über die Gefühlsklasse des Gibbs-Reflexionszyklus.</h2><p>Um deine Gefühle zu verbessern, beachte bitte Folgendes:<br />1. Sei ehrlich und offen über deine Gedanken und Gefühle.<br />2. Verwende eine klare und prägnante Sprache.<br />3. Vermeide Annahmen oder Verallgemeinerungen.<br />4. Konzentriere dich auf deine persönlichen Erfahrungen und Reaktionen.<br />5. Berücksichtige den Kontext und die beteiligten Personen.<br />Wenn du diese Richtlinien befolgst, kannst du eine detaillierte und genaue Beschreibung deiner Gedanken und Gefühle während des Erlebnisses erstellen.</p><h2>Wie kann ich das Schreiben der Klasse 'Gefühle' verbessern?</h2><p>Um deine Gefühle zu verbessern, solltest du Folgendes beachten:<br />1. Sei ehrlich und offen in Bezug auf deine Gefühle.<br />2. Beschreibe, wie du dich während des Erlebnisses gefühlt hast.<br />3. Identifiziere alle zugrunde liegenden Überzeugungen oder Annahmen, die dein Verhalten beeinflusst haben könnten.<br />4. Vermeide Annahmen oder Verallgemeinerungen.<br />5. Konzentriere dich auf die Fakten und nicht auf deine Interpretation der Ereignisse.<br />Wenn du diese Richtlinien befolgst, kannst du eine detaillierte und genaue Beschreibung des Erlebnisses erstellen.</p><h2>Was sind einige Beispiele für gute Gefühle?</h2><p>Hier sind einige Beispiele für gute Gefühle:<br />1. Ich fühlte mich frustriert, als mein Kollege mich während der Besprechung unterbrach.<br />2. Ich war besorgt wegen meiner Leistungsbeurteilung.<br />3. Ich war aufgeregt wegen des neuen Projekts.<br />4. Ich fühlte mich nervös wegen der Schulungssitzung.<br />5. Ich fühlte mich durch die Brainstorming-Sitzung inspiriert.<br />Diese Gefühle liefern relevante Details über Ihre Emotionen während des Erlebnisses, einschließlich des Kontexts, der beteiligten Personen und der durchgeführten Aktionen. Zum Beispiel, anstatt zu sagen, dass du frustriert warst, könntest du angeben, was dich frustriert hat.</p><h2>Was sind einige Beispiele für schlechte Gefühle?</h2><p>Hier sind einige Beispiele für schlechte Gefühle:<br />1. Ich war frustriert.<br />2. Ich fühlte mich ängstlich.<br />3. Ich fühlte mich aufgeregt.<br />4. Ich fühlte mich nervös.<br />5. Ich habe mich inspiriert gefühlt.<br />Diesen Gefühlen fehlen relevante Details über Ihre Emotionen während der Erfahrung, was es schwierig macht, den Kontext oder den Zweck des Treffens zu verstehen. Als Beispiel für schlechte Gefühle, wenn jemand sagt 'Ich war frustriert', könnte es schwierig sein, zu verstehen, was die Person frustriert hat.</p><h2>Gib mir mehr Details über die Bewertungsklasse des Gibbs-Reflexionszyklus.</h2><p>Im Bewertungskurs des Gibbs-Reflexionszyklus analysierst du die Erfahrung kritisch und ziehst Schlussfolgerungen. Diese Phase zielt darauf ab, die Gesamtauswirkungen der Situation einzuschätzen und sowohl positive als auch negative Aspekte zu berücksichtigen. Dieser Schritt ist auch für das persönliche Wachstum und die kontinuierliche Verbesserung von entscheidender Bedeutung.</p><h2>Wie kann ich das Schreiben der Bewertung-Klasse verbessern?</h2><p>Um deine Bewertung zu verbessern, beachte bitte Folgendes:<br />1. Sei ehrlich und offen in Bezug auf deine Meinung.<br />2. Berücksichtige sowohl positive als auch negative Aspekte der Erfahrung.<br />3. Konzentriere dich auf die Gesamtwirkung der Erfahrung, einschließlich positiver und negativer Aspekte.<br />4. Überlege, wie sich die Erfahrung auf deine Überzeugungen oder Handlungen ausgewirkt hat.<br />5. Berücksichtige den Kontext und die beteiligten Personen.<br />Wenn du diese Richtlinien befolgst, kannst du eine detaillierte und genaue Bewertung der Erfahrung erstellen.</p><h2>Kannst du ein Beispiel für eine gut strukturierte Bewertung geben?</h2><p>Sicherlich! Eine gut strukturierte Bewertung sollte:<br />1. Berücksichtige sowohl positive als auch negative Aspekte der Erfahrung.<br />2. Konzentriere dich auf die Gesamtwirkung der Erfahrung, einschließlich positiver und negativer Aspekte.<br />3. Überlege, wie sich die Erfahrung auf deine Überzeugungen oder Handlungen ausgewirkt hat.<br />4. Berücksichtige den Kontext und die beteiligten Personen.<br />5. Vermittle ein umfassendes Verständnis der Auswirkungen der Erfahrung auf deine persönliche und berufliche Entwicklung. Zum Beispiel, anstatt nur zu sagen, dass das Treffen mit einem Kollegen gut oder schlecht war, könntest du die spezifischen Faktoren bewerten, die zu deinen Gedanken, Gefühlen und Handlungen während des Treffens beigetragen haben.</p><h2>Kannst du ein Beispiel für eine schlecht durchgeführte Bewertung nennen?</h2><p>Gewiss! Eine schlecht durchgeführte Bewertung könnte:<br />1. eine gründliche Bewertung der Gesamtauswirkungen der Erfahrung vermissen lassen.<br />2. sich ausschließlich auf positive oder negative Aspekte konzentrieren und damit eine unausgewogene Perspektive bieten.<br />3. du gibst eine oberflächliche oder vage Zusammenfassung ohne konkrete Lehren. Du könntest beispielsweise ein kürzliches Treffen mit einem Kollegen bewerten, dich aber nur auf die negativen Aspekte des Treffens konzentrieren, ohne die positiven Aspekte zu berücksichtigen. Als Beispiel für eine schlecht durchgeführte Bewertung, wenn jemand sagt, dass das Treffen schlecht war, könnte es schwierig sein, zu verstehen, was genau das Treffen schlecht gemacht hat.</p><h2>Gib mir mehr Details über die Analyze-Klasse des Gibbs-Reflexionszyklus.</h2><p>Die Klasse 'Analysieren' ist die dritte Stufe des Gibbs'schen Reflexionszyklus, in der du dich mit einer Erfahrung auseinandersetzt und ihre verschiedenen Aspekte analysierst. In dieser Phase geht es darum, die Situation zu zerlegen, verschiedene Elemente zu untersuchen und Muster oder Zusammenhänge zu erkennen. Die Analyse der Erfahrung hilft dir, die zugrunde liegenden Faktoren zu verstehen, die zu dem Ergebnis beigetragen haben. Berücksichtige den Kontext, relevante Theorien und äußere Einflüsse, die deine Wahrnehmung und dein Handeln während des Erlebnisses beeinflusst haben könnten.</p><h2>Wie kann ich das Schreiben der Analyze-Klasse verbessern?</h2><p>Um deine Analyse zu verbessern, beachte bitte Folgendes:<br />1. Zerlege die Situation in ihre wichtigsten Bestandteile.<br />2. Untersuche die Faktoren, die deine Gedanken, Gefühle und Handlungen beeinflussen.<br />3. Identifiziere Muster oder Verbindungen zwischen verschiedenen Elementen.<br />4. Erforsche relevante Theorien oder Konzepte, um das Verständnis zu verbessern.<br />5. Versuche, einen umfassenden Einblick in die Faktoren zu gewinnen, die zum Ergebnis beitragen.<br />Wenn du diese Richtlinien befolgst, kannst du eine detaillierte und genaue Analyse der Erfahrung erstellen.</p><h2>Kannst du ein Beispiel für eine gut analysierte Erfahrung nennen?</h2><p>Sicherlich! Eine gut analysierte Erfahrung sollte:<br />1. Die Situation in ihre wichtigsten Bestandteile zerlegen, z. B. den Kontext, die beteiligten Personen und die durchgeführten Maßnahmen.<br />2. Untersuchen, welche Faktoren deine Gedanken, Gefühle und dein Verhalten während des Erlebnisses beeinflusst haben.<br />3. Identifizieren von Mustern oder Verbindungen zwischen verschiedenen Elementen.<br />4. Erforschen von relevanten Theorien oder Konzepten, die helfen können, die Dynamik der Situation zu erklären.<br />5. Vermitteln eines umfassenden Verständnisses der Faktoren, die zu dem Ergebnis beigetragen haben. Zum Beispiel, anstatt nur zu sagen, dass das Treffen mit einem Kollegen gut oder schlecht war, könntest du die spezifischen Faktoren analysieren, die zu deinen Gedanken, Gefühlen und Handlungen während des Treffens beigetragen haben.</p><h2>Kannst du ein Beispiel für eine schlecht durchgeführte Analyse nennen?</h2><p>Sicherlich! Eine schlecht durchgeführte Analyse könnte:<br />1. eine oberflächliche Untersuchung der Situation vornehmen, ohne sie in ihre wichtigsten Bestandteile zu zerlegen.<br />2. die Faktoren vernachlässigen, die Gedanken, Gefühle und Verhalten beeinflusst haben.<br />3. Es fehlt die Identifizierung von Mustern oder Verbindungen zwischen verschiedenen Elementen.<br />4. Du versäumst es, relevante Theorien oder Konzepte einzubeziehen, was zu einem begrenzten Verständnis führt.<br />5. Du bietest eine oberflächliche oder unvollständige Analyse, die nicht zu einem tieferen Einblick in die Erfahrung beiträgt. Zum Beispiel, anstatt die Faktoren zu untersuchen, die zu deinen Gedanken, Gefühlen und Handlungen während des Treffens beigetragen haben, könntest du eine oberflächliche oder unvollständige Analyse der Situation bieten.</p><h2>Gib mir mehr Details über die Schlussfolgerungsklasse des Gibbs-Reflexionszyklus.</h2><p>Die Klasse Schlussfolgerung ist die fünfte Phase des Gibbs-Reflexionszyklus, in der du den gesamten Reflexionsprozess zusammenfasst und Schlussfolgerungen ziehst. In dieser Phase geht es darum, die aus der Beschreibung, den Gefühlen, der Bewertung und der Analyse gewonnenen Erkenntnisse zusammenzufassen. Denke über die gesamte Lernerfahrung nach, darüber, wie sie sich auf deine persönliche und berufliche Entwicklung ausgewirkt hat.</p><h2>Wie kann ich das Schreiben der Schlussfolgerungsklasse verbessern?</h2><p>Um deine Schlussfolgerung zu verbessern, beachte bitte Folgendes:<br />1. Fasse die wichtigsten Erkenntnisse aus den Phasen Beschreibung, Gefühle, Bewertung und Analyse zusammen.<br />2. Vermittle ein Gefühl des Abschlusses und der Lösung und schließe den Reflexionszyklus ab.<br />Wenn du diese Richtlinien befolgst, kannst du eine detaillierte und genaue Schlussfolgerung des Reflexionsprozesses erstellen.</p><h2>Kannst du ein Beispiel für eine gut formulierte Schlussfolgerung geben?</h2><p>Sicherlich! Ein gut ausgearbeiteter Schluss sollte:<br />1. Die wichtigsten Erkenntnisse und Beobachtungen aus den Phasen Beschreibung, Gefühle, Bewertung und Analyse zusammenfassen.<br />2. Über die allgemeinen Auswirkungen der Erfahrung auf die persönliche und berufliche Entwicklung nachdenken.<br />3. Hebe alle Veränderungen in den Überzeugungen, Verhaltensweisen oder Handlungen hervor, die sich aus dem Reflexionsprozess ergeben haben.<br />4. Vermittle ein Gefühl des Abschlusses und der Auflösung des Reflexionszyklus.</p><h2>Kannst du ein Beispiel für eine schlecht konstruierte Schlussfolgerung nennen?</h2><p>Certainly! Eine schlecht konstruierte Schlussfolgerung könnte:<br />1. Die wichtigsten Erkenntnisse aus den früheren Phasen des Reflexionszyklus nicht zusammenfassen.<br />2. Es fehlt eine Reflexion über die Gesamtauswirkungen der Erfahrung auf die persönliche und berufliche Entwicklung.<br />3. Ein abruptes Ende ohne ein Gefühl des Abschlusses des Reflexionszyklus bieten. Zum Beispiel, anstatt die wichtigsten Erkenntnisse aus den früheren Phasen des Reflexionszyklus zusammenzufassen, könntest du eine unvollständige oder oberflächliche Schlussfolgerung bieten, die nicht zu einem tieferen Verständnis der Erfahrung beiträgt.</p><h2>Gib mir mehr Details über die Aktionsplan-Klasse des Gibbs-Reflexionszyklus.</h2><p>Die Klasse Aktionsplan ist in der du auf der Grundlage der durch die Reflexion gewonnenen Erkenntnisse konkrete Schritte für künftige Maßnahmen skizzierst. In dieser Phase geht es darum, verbesserungswürdige Bereiche zu identifizieren und einen Plan zur Umsetzung positiver Veränderungen zu formulieren. Überlege, wie du die aus der Erfahrung gewonnenen Erkenntnisse anwenden kannst, um deine Fähigkeiten, Verhaltensweisen oder Vorgehensweisen in ähnlichen Situationen zu verbessern. Der Aktionsplan dient als praktischer Leitfaden für die persönliche und berufliche Entwicklung.</p><h2>Wie kann ich das Schreiben der Aktionsplan-Klasse verbessern?</h2><p>Um deinen Aktionsplan zu verbessern, beachte bitte Folgendes:<br />1. Identifiziere anhand der Erkenntnisse aus dem Reflexionsprozess eindeutig spezifische Verbesserungsbereiche.<br />2. Skizziere konkrete und erreichbare Schritte oder Maßnahmen, um diese Bereiche anzugehen.<br />3. Berücksichtige potenzielle Herausforderungen oder Hindernisse und entwickle Strategien zu deren Überwindung.<br />4. Verbinde jede Aktion mit den umfassenderen Zielen der persönlichen und beruflichen Entwicklung.</p><h2>Kannst du ein Beispiel für einen gut definierten Aktionsplan nennen?</h2><p>Sicherlich! Ein klar definierter Aktionsplan sollte:<br />1. Identifiziere anhand der Erkenntnisse aus dem Reflexionsprozess eindeutig spezifische Verbesserungsbereiche.<br />2. Skizziere konkrete und erreichbare Schritte oder Maßnahmen, um diese Bereiche anzugehen.<br />3. Berücksichtige potenzielle Herausforderungen oder Hindernisse und entwickle Strategien zu deren Überwindung.<br />4. Verbinde jede Aktion mit den umfassenderen Zielen der persönlichen und beruflichen Entwicklung. Zum Beispiel, anstatt nur zu sagen, dass du dich in Zukunft besser auf Besprechungen vorbereiten wirst, könntest du konkrete Schritte skizzieren, wie du deine Vorbereitung verbessern wirst.</p><h2>Kannst du ein Beispiel für einen schlecht formulierten Aktionsplan nennen?</h2><p>Sicherlich! Ein schlecht formulierter Aktionsplan könnte:<br />1. Mangelnde Spezifität, mit vagen oder allgemeinen Verbesserungsmöglichkeiten.<br />2. Stellen unklare oder unpraktische Schritte bereit, um identifizierte Bereiche anzugehen.<br />3. Es ist nicht möglich, realistische Zeitpläne oder Meilensteine für die Umsetzung von Änderungen festzulegen.<br />4. Übersehen potenzielle Herausforderungen und machen den Plan anfällig für Hindernisse.<br />5. Es fehlt ein klarer Zusammenhang zwischen den einzelnen Maßnahmen und umfassenderen Zielen der persönlichen und beruflichen Entwicklung. Zum Beispiel, anstatt konkrete und erreichbare Schritte zu skizzieren, um die identifizierten Bereiche anzugehen, könntest du vage oder unrealistische Schritte bereitstellen, die nicht zu einer effektiven Umsetzung führen.</p>
            </div>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          {language == "de" && <Button onClick={handleCloseGuideDialog}>Schließen</Button>}
          {language == "en" && <Button onClick={handleCloseGuideDialog}>Close</Button>}
        </DialogActions>
      </Dialog>

      <Dialog open={isSpecifityWhyDialogOpen} onClose={handleCloseSpecifityWhyDialog} scroll={"paper"} aria-labelledby="scroll-dialog-title" aria-describedby="scroll-dialog-description" >
        {language == "de" && <DialogTitle id="scroll-dialog-title">Grund</DialogTitle>}
        {language == "en" && <DialogTitle id="scroll-dialog-title">Reason</DialogTitle>}
        <DialogContent dividers={true}>
          <DialogContentText
            id="scroll-dialog-description"
            tabIndex={-1} >
            <div style={{ fontSize: '105%' }}>
              <p dangerouslySetInnerHTML={{__html: specifityWhy}}></p>
            </div>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          {language == "de" && <Button onClick={handleCloseSpecifityWhyDialog}>Schließen</Button>}
          {language == "en" && <Button onClick={handleCloseSpecifityWhyDialog}>Close</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}

export default MainPage;
