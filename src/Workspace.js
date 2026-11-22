import './Workspace.css';
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import ReactPlayer from 'react-player';
import { useNavigate } from 'react-router-dom';

import DeleteEntry from './DeleteEntry';
import ImportSrt from './ImportSrt';
import ExportSrt from './ExportSrt';
import QualityPanel from './Errorchecking';
import ShiftTiming from './ShiftTiming';
import Tools from './Tools';
import TypingPanel from './TypingPanel';
import { typedCueRange, SPEEDS, stepSpeed, loopRangeFor } from './lib/typing';
import BulkDelete from './BulkDelete';
import CueRow from './CueRow';
import FindReplace from './FindReplace';
import ShortcutsHelp from './ShortcutsHelp';
import WaveformTimeline from './WaveformTimeline';
import SubtitleOverlay from './SubtitleOverlay';
import { getPeaks } from './lib/waveform';
import { useToast } from './Toast';

import { makeCue } from './lib/cues';
import { writeSubtitles } from './lib/formats';
import { formatTime, parseTime, secondsToMs, maskTimeInput, isCompleteTime } from './lib/time';
import {
  insertByStart, selectionRange, mergeRange, splitCue, nudgeCues, setCueEdge, newCueAt, replaceInCues,
} from './lib/edit';
import { cueStats } from './lib/stats';
import { checkCues, levelsById, summarize, applyFixes, DEFAULT_SETTINGS, RULES } from './lib/qc';
import { useHistory } from './lib/history';
import {
  projectExists, loadCues, saveCues, writeRescue,
  saveVideo, loadVideoRecord, restoreVideoFile, requestHandleFile,
  supportsFileHandles, requestPersistentStorage,
} from './lib/storage';

const SAVE_DEBOUNCE_MS = 400;
const NUDGE_MS = 100;
const VIDEO_PICKER_TYPES = [{
  description: 'Video files',
  accept: { 'video/*': ['.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.ogv'] },
}];
const EMPTY_SET = new Set();
const EMPTY_MAP = new Map();
const VIDEO_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ogv|mpg|mpeg|3gp)$/i;
const SUB_EXT = /\.(srt|vtt|webvtt|ass|ssa|sbv|sub|txt)$/i;

const draftFromCue = (c) => ({ startTime: formatTime(c.startMs), endTime: formatTime(c.endMs), text: c.text, base: c });
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function readPref(key, fallback) {
  try { const v = localStorage.getItem(`srtc:pref:${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(`srtc:pref:${key}`, JSON.stringify(value)); } catch { /* optional */ }
}

/**
 * Workspace — single responsive layout for the SRT editor.
 * Desktop: 3-pane grid (Video | Timeline | Properties). Mobile: stacked.
 *
 * Data: one `cues` array of { id, startMs, endMs, text } inside an undo history.
 * Selection: a set of ids plus a "primary" cue (the one shown in Properties).
 */
function Workspace() {
  const navigate = useNavigate();
  const toast = useToast();

  // ---------------- project + cues (with undo) ----------------
  const history = useHistory([]);
  const cues = history.value;
  const commit = history.set;
  const [projectName, setProjectName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'saving' | 'error'

  // ---------------- selection ----------------
  const [sel, setSel] = useState({ ids: EMPTY_SET, primary: null, anchor: null });
  const [draft, setDraft] = useState(null);
  const [matchIds, setMatchIds] = useState(EMPTY_SET);
  const [delIds, setDelIds] = useState(null);

  // ---------------- dialogs / panels ----------------
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusSignal, setFindFocusSignal] = useState(0);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftScope, setShiftScope] = useState('all');
  const [helpOpen, setHelpOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [follow, setFollow] = useState(() => readPref('follow', true));
  const [qcOpen, setQcOpen] = useState(false);
  const [qcSettings, setQcSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...readPref('qc', {}) }));
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [dragKind, setDragKind] = useState(null); // null | 'files' while dragging files over the editor

  // ---------------- video ----------------
  const [video, setVideo] = useState(null);               // { url, name, size, file }
  const [videoDurMs, setVideoDurMs] = useState(0);
  const [wave, setWave] = useState({ state: 'novideo' }); // { state, text, progress, peaks, durationMs }
  const [waveRetry, setWaveRetry] = useState(0);
  const [waveOpen, setWaveOpen] = useState(() => readPref('wave', true));
  const [subScale, setSubScale] = useState(() => Math.min(2, Math.max(0.6, Number(readPref('subScale', 1)) || 1)));
  const [videoFullscreen, setVideoFullscreen] = useState(false);

  // ---------------- playback aids + typing mode ----------------
  const [rate, setRate] = useState(() => { const r = Number(readPref('rate', 1)); return SPEEDS.includes(r) ? r : 1; });
  const [loop, setLoop] = useState(false);
  const [rewindSec, setRewindSec] = useState(() => Number(readPref('rewind', 0)) || 0);
  const [typing, setTyping] = useState(false);
  const [typeText, setTypeText] = useState('');
  const [segStartMs, setSegStartMs] = useState(0);
  const [pauseOnType, setPauseOnType] = useState(() => readPref('pauseOnType', true) !== false);
  const [typedCount, setTypedCount] = useState(0);
  const [pendingVideo, setPendingVideo] = useState(null); // stored record we couldn't auto-restore
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);

  // ---------------- quick add ----------------
  const [row, setRow] = useState({ startTime: '', endTime: '', text: '' });

  const playerRef = useRef(null);
  const timelineRef = useRef(null);
  const typeRef = useRef(null);
  const typedEndRef = useRef(null);     // playhead when the user started typing the current cue
  const autoPausedRef = useRef(false);  // we paused for typing → resume after Enter/Esc
  const skipRewindRef = useRef(false);  // pauses we cause ourselves don't rewind
  const fileInputRef = useRef(null);
  const textRef = useRef(null);
  const rowEls = useRef({});
  const saveTimer = useRef(null);
  const draftMergeRef = useRef(() => ({}));
  const skipNextSave = useRef(true);   // initial load isn't an edit — don't save or bump "Modified"
  const skipBlurSave = useRef(false);  // Esc in a field discards instead of saving
  const focusTextNext = useRef(false); // focus the text field once the new draft renders
  const caret = useRef({ id: null, index: null });
  const latest = useRef({});
  latest.current = { projectName, cues, sel, currentMs, video, draft, typing, typeText, isPlaying };

  const primaryIndex = useMemo(() => {
    if (sel.primary == null) return null;
    const i = cues.findIndex(c => c.id === sel.primary);
    return i === -1 ? null : i;
  }, [cues, sel.primary]);
  const primaryCue = primaryIndex == null ? null : cues[primaryIndex];
  const multi = sel.ids.size > 1;

  const playingId = useMemo(() => {
    const c = cues.find(x => currentMs >= x.startMs && currentMs < x.endMs);
    return c ? c.id : null;
  }, [cues, currentMs]);

  // ---------------------------------------------------------------
  // Load project
  // ---------------------------------------------------------------
  const resetHistory = history.reset;
  useEffect(() => {
    let cancelled = false;
    const name = sessionStorage.getItem('project');
    if (name == null) { navigate('/'); return undefined; }

    (async () => {
      try {
        if (!(await projectExists(name))) { navigate('/'); return; }
        const stored = await loadCues(name);
        if (cancelled) return;
        setProjectName(name);
        skipNextSave.current = true;
        resetHistory(stored);
        setLoaded(true);
        requestPersistentStorage();

        const record = await loadVideoRecord(name);
        if (cancelled || !record) return;
        const restored = await restoreVideoFile(record);
        if (cancelled) return;
        if (restored?.file) {
          setVideo({ url: URL.createObjectURL(restored.file), name: restored.file.name, size: restored.file.size, file: restored.file });
        } else {
          setPendingVideo(record);
        }
      } catch (err) {
        console.error(err);
        toast.error(`Couldn't load this project: ${err.message}`);
      }
    })();

    return () => { cancelled = true; };
  }, [navigate, toast, resetHistory]);

  // ---------------------------------------------------------------
  // Autosave (debounced). Saves an empty list too, so deleting every cue sticks.
  // ---------------------------------------------------------------
  const flushSave = useCallback(async (override) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const { projectName: name } = latest.current;
    const current = override || latest.current.cues;
    if (!name) return;
    try {
      await saveCues(name, current);
      setSaveState('saved');
    } catch (err) {
      console.error(err);
      setSaveState('error');
      toast.error(`Autosave failed: ${err.message}. Export your SRT to be safe.`, { duration: 0 });
    }
  }, [toast]);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [cues, loaded, flushSave]);

  useEffect(() => {
    // Leaving the page (reload, tab close, back to projects): save pending changes,
    // including text still sitting in the cue editor that never got a blur.
    const onHide = () => {
      const r = draftMergeRef.current(latest.current.draft, latest.current.cues);
      if (!r.changed && !saveTimer.current) return;
      const list = r.changed ? r.list : latest.current.cues;
      if (latest.current.projectName) writeRescue(latest.current.projectName, list);
      flushSave(list);
    };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); onHide(); };
  }, [flushSave]);

  // ---------------------------------------------------------------
  // Keep selection valid after undo/delete; keep the draft in sync with the primary cue
  // ---------------------------------------------------------------
  useEffect(() => {
    setSel(s => {
      if (s.ids.size === 0 && s.primary == null) return s;
      const present = new Set(cues.map(c => c.id));
      const ids = new Set([...s.ids].filter(id => present.has(id)));
      let primary = s.primary != null && present.has(s.primary) ? s.primary : null;
      if (primary == null && ids.size) primary = ids.values().next().value;
      if (ids.size === s.ids.size && primary === s.primary) return s;
      return { ...s, ids, primary };
    });
  }, [cues]);

  // Layout effect, not effect: the draft must match the cue before the browser can
  // fire a blur, or a fast blur could save stale text over a just-split cue.
  useLayoutEffect(() => {
    setDraft(primaryCue ? draftFromCue(primaryCue) : null);
  }, [primaryCue]);

  useEffect(() => {
    if (focusTextNext.current && draft && textRef.current) {
      focusTextNext.current = false;
      textRef.current.focus();
    }
  }, [draft]);

  // ---------------------------------------------------------------
  // Live subtitle preview track
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!playerReady || !playerRef.current) return undefined;
    const videoElement = playerRef.current.getInternalPlayer();
    if (!videoElement || typeof videoElement.querySelectorAll !== 'function') return undefined;

    const objectURL = URL.createObjectURL(new Blob([writeSubtitles(cues, 'vtt')], { type: 'text/vtt' }));
    videoElement.querySelectorAll('track').forEach(t => t.remove());
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.src = objectURL;
    track.srclang = 'en';
    track.label = 'Subtitles';
    track.default = true;
    videoElement.appendChild(track);

    const raf = requestAnimationFrame(() => {
      Array.from(videoElement.textTracks).forEach(tt => {
        if (tt.kind === 'subtitles') tt.mode = tt.label === 'Subtitles' ? (videoFullscreen ? 'showing' : 'hidden') : 'disabled';
      });
    });
    return () => { cancelAnimationFrame(raf); URL.revokeObjectURL(objectURL); };
  }, [cues, playerReady, video, videoFullscreen]);

  // The overlay lives outside the <video>, so it can't appear when the video element itself goes
  // fullscreen; the browser's own subtitle track takes over there.
  useEffect(() => {
    const update = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement;
      const v = playerRef.current?.getInternalPlayer?.();
      setVideoFullscreen(Boolean(el && v && (el === v || (el.contains && el.contains(v)) )) && !(el && el.classList?.contains('ws-video-wrap')));
    };
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  const changeSubScale = (delta) => setSubScale(v => {
    const next = Math.round(Math.min(2, Math.max(0.6, v + delta)) * 10) / 10;
    writePref('subScale', next);
    return next;
  });

  useEffect(() => () => { if (video?.url) URL.revokeObjectURL(video.url); }, [video]);

  // Follow playback: keep the cue under the playhead visible while playing.
  useEffect(() => {
    if (follow && isPlaying && playingId) rowEls.current[playingId]?.scrollIntoView({ block: 'nearest' });
  }, [follow, isPlaying, playingId]);

  // ---------------------------------------------------------------
  // Video open / restore / seek
  // ---------------------------------------------------------------
  const applyVideoFile = useCallback(async (file, handle) => {
    if (!file) return;
    if (pendingVideo?.name && pendingVideo.name !== file.name) {
      toast.warn(`This project was last used with "${pendingVideo.name}". You opened "${file.name}".`);
    }
    setPlayerReady(false);
    setIsPlaying(false);
    setVideoDurMs(0);
    setVideo({ url: URL.createObjectURL(file), name: file.name, size: file.size, file });
    setPendingVideo(null);

    const name = latest.current.projectName;
    if (!name) return;
    try {
      const kind = await saveVideo(name, { file, handle });
      if (kind === 'meta') toast.info("This video is too large to keep in the browser — you'll be asked to reopen it next time.");
    } catch (err) {
      console.error(err);
    }
  }, [pendingVideo, toast]);

  const openVideo = useCallback(async () => {
    if (supportsFileHandles()) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: VIDEO_PICKER_TYPES, multiple: false });
        await applyVideoFile(await handle.getFile(), handle);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    fileInputRef.current?.click();
  }, [applyVideoFile]);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    applyVideoFile(file, null);
  };

  const reconnectVideo = async () => {
    if (pendingVideo?.kind === 'handle') {
      try {
        const file = await requestHandleFile(pendingVideo);
        if (file) { await applyVideoFile(file, pendingVideo.handle); return; }
      } catch { /* moved or denied — fall through */ }
      toast.warn(`Couldn't reach "${pendingVideo.name}". Pick the file again.`);
    }
    openVideo();
  };

  /**
   * Move the playhead. A seek the user makes (clicking the timeline, a cue, arrow keys)
   * also moves where the next typed cue starts — unless they're mid-way through typing one.
   * Seeks we make ourselves (loop, rewind) pass { user: false }.
   */
  const seek = useCallback((ms, { user = true } = {}) => {
    const t = Math.max(0, ms);
    if (playerRef.current && latest.current.video) playerRef.current.seekTo(t / 1000, 'seconds');
    setCurrentMs(t);
    if (user && latest.current.typing && !latest.current.typeText.trim()) setSegStartMs(t);
  }, []);

  const handleProgress = (state) => setCurrentMs(secondsToMs(state.playedSeconds));
  const togglePlay = useCallback(() => { if (latest.current.video) setIsPlaying(p => !p); }, []);
  const currentTime = formatTime(currentMs);

  // ---------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------
  const scrollToCue = useCallback((id) => rowEls.current[id]?.scrollIntoView({ block: 'nearest' }), []);

  const selectOnly = useCallback((id, { seekTo = false } = {}) => {
    setSel({ ids: id == null ? EMPTY_SET : new Set([id]), primary: id, anchor: id });
    if (id == null) return;
    scrollToCue(id);
    if (seekTo) {
      const c = latest.current.cues.find(x => x.id === id);
      if (c) seek(c.startMs);
    }
  }, [scrollToCue, seek]);

  const selectRangeTo = useCallback((id) => {
    const list = latest.current.cues;
    const { anchor } = latest.current.sel;
    const a = list.findIndex(c => c.id === (anchor ?? id));
    const b = list.findIndex(c => c.id === id);
    if (b === -1) return;
    const [lo, hi] = a === -1 ? [b, b] : [Math.min(a, b), Math.max(a, b)];
    setSel(s => ({ ids: new Set(list.slice(lo, hi + 1).map(c => c.id)), primary: id, anchor: s.anchor ?? id }));
    scrollToCue(id);
  }, [scrollToCue]);

  const toggleInSelection = useCallback((id) => {
    setSel(s => {
      const ids = new Set(s.ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      const primary = ids.has(id) ? id : (ids.size ? [...ids][ids.size - 1] : null);
      return { ids, primary, anchor: id };
    });
  }, []);

  const handleRowMouseDown = useCallback((e) => { if (e.shiftKey) e.preventDefault(); }, []); // no text selection on shift-click
  const handleRowClick = useCallback((id, e) => {
    if (e.ctrlKey || e.metaKey) toggleInSelection(id);
    else if (e.shiftKey) selectRangeTo(id);
    else selectOnly(id, { seekTo: true });
  }, [toggleInSelection, selectRangeTo, selectOnly]);

  const setRowEl = useCallback((id, el) => { if (el) rowEls.current[id] = el; else delete rowEls.current[id]; }, []);

  const selectedIdsOrPrimary = () => {
    const { sel: s } = latest.current;
    if (s.ids.size) return s.ids;
    return s.primary ? new Set([s.primary]) : EMPTY_SET;
  };

  // ---------------------------------------------------------------
  // Editing operations (all undoable)
  // ---------------------------------------------------------------
  const undoFromToast = history.undo;

  const undo = () => {
    if (!history.canUndo) return;
    history.undo();
    toast.info(`Undid: ${history.undoLabel}`, { duration: 1800 });
  };

  const redo = () => {
    if (!history.canRedo) return;
    history.redo();
    toast.info(`Redid: ${history.redoLabel}`, { duration: 1800 });
  };

  const addCue = () => {
    if (!isCompleteTime(row.startTime) || !isCompleteTime(row.endTime)) {
      toast.error('Start and end must be full timecodes, like 00:01:02,500.');
      return;
    }
    const startMs = parseTime(row.startTime);
    const endMs = parseTime(row.endTime);
    if (endMs <= startMs) { toast.error('End time must be after start time.'); return; }
    const cue = makeCue({ startMs, endMs, text: row.text });
    commit(prev => insertByStart(prev, cue), 'Add cue');
    setRow({ startTime: '', endTime: '', text: '' });
  };

  const handleQuickTime = (e) => {
    const { id, value } = e.target;
    setRow(r => ({ ...r, [id]: maskTimeInput(value) }));
  };

  const newCueAtPlayhead = () => {
    const cue = newCueAt(latest.current.cues, latest.current.currentMs);
    commit(prev => insertByStart(prev, cue), 'New cue');
    focusTextNext.current = true;
    setSel({ ids: new Set([cue.id]), primary: cue.id, anchor: cue.id });
    requestAnimationFrame(() => scrollToCue(cue.id));
  };

  // Merge the open draft into a cue list. Only fields the user actually changed are
  // written, on top of the cue as it is now. Returns { list } or { error }.
  const mergeDraft = (d, list) => {
    if (!d) return { list };
    const current = list.find(c => c.id === d.base.id);
    if (!current) return { list };
    const was = draftFromCue(d.base);
    const changed = {
      start: d.startTime !== was.startTime,
      end: d.endTime !== was.endTime,
      text: d.text !== was.text,
    };
    if (!changed.start && !changed.end && !changed.text) return { list };
    if ((changed.start && !isCompleteTime(d.startTime)) || (changed.end && !isCompleteTime(d.endTime))) {
      return { error: 'Times must be full timecodes, like 00:01:02,500. Change not saved.' };
    }
    const startMs = changed.start ? parseTime(d.startTime) : current.startMs;
    const endMs = changed.end ? parseTime(d.endTime) : current.endMs;
    const text = changed.text ? d.text : current.text;
    if (startMs === current.startMs && endMs === current.endMs && text === current.text) return { list };
    return { list: list.map(c => (c.id === current.id ? { ...c, startMs, endMs, text } : c)), changed: true };
  };

  draftMergeRef.current = mergeDraft;

  const saveDraft = () => {
    const { draft: d, cues: list } = latest.current;
    const r = mergeDraft(d, list);
    if (r.error) { toast.error(r.error); return; }
    if (r.changed) commit(() => r.list, 'Edit cue');
  };

  const handleFieldBlur = () => {
    if (skipBlurSave.current) { skipBlurSave.current = false; return; }
    saveDraft();
  };

  const resetDraft = () => { const c = latest.current.cues.find(x => x.id === latest.current.sel.primary); if (c) setDraft(draftFromCue(c)); };

  const handleDraftChange = (field, value) => {
    setDraft(d => ({ ...d, [field]: field === 'text' ? value : maskTimeInput(value) }));
  };

  const handleFieldKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't let the global Esc (clear selection) see this
      skipBlurSave.current = true;
      resetDraft();
      e.currentTarget.blur();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.blur(); // blur saves
    }
  };

  const trackCaret = (e) => {
    if (primaryCue) caret.current = { id: primaryCue.id, index: e.currentTarget.selectionStart };
  };

  const requestDelete = (ids) => {
    const list = [...ids];
    if (!list.length) return;
    if (list.length === 1) {
      // Single delete: no dialog — it's one Ctrl+Z away.
      const set = new Set(list);
      commit(prev => prev.filter(c => !set.has(c.id)), 'Delete cue');
      toast.info('Cue deleted', { action: { label: 'Undo', onClick: undoFromToast } });
      return;
    }
    setDelIds(list);
  };
  const requestDeleteRef = useRef(requestDelete);
  requestDeleteRef.current = requestDelete;
  const handleRowDelete = useCallback((id) => requestDeleteRef.current([id]), []);

  const handleDeleteConfirmed = () => {
    const set = new Set(delIds);
    commit(prev => prev.filter(c => !set.has(c.id)), `Delete ${set.size} cues`);
    toast.info(`Deleted ${set.size} cues`, { action: { label: 'Undo', onClick: undoFromToast } });
    setDelIds(null);
  };

  const mergeAt = useCallback((index) => {
    const res = mergeRange(latest.current.cues, index, index + 1);
    if (!res) return;
    commit(res.cues, 'Merge cues');
    setSel({ ids: new Set([res.mergedId]), primary: res.mergedId, anchor: res.mergedId });
  }, [commit]);

  const mergeSelection = () => {
    const list = latest.current.cues;
    const range = selectionRange(list, selectedIdsOrPrimary());
    if (!range) return;
    if (range.count === 1) { mergeAt(range.lo); return; }
    if (!range.contiguous) { toast.warn('Select cues that sit next to each other to merge them.'); return; }
    const res = mergeRange(list, range.lo, range.hi);
    commit(res.cues, `Merge ${range.count} cues`);
    setSel({ ids: new Set([res.mergedId]), primary: res.mergedId, anchor: res.mergedId });
  };

  const splitPrimary = ({ useDraft = false } = {}) => {
    const { cues: list, sel: s, draft: d, currentMs: now, video: v } = latest.current;
    const cue = list.find(c => c.id === s.primary);
    if (!cue) return;
    const base = useDraft && d ? { ...cue, text: d.text } : cue;
    const textIndex = caret.current.id === cue.id ? caret.current.index : undefined;
    const parts = splitCue(base, { atMs: v ? now : undefined, textIndex });
    if (!parts) { toast.warn('This cue is too short to split.'); return; }
    commit(prev => prev.flatMap(c => (c.id === cue.id ? parts : [c])), 'Split cue');
    caret.current = { id: null, index: null };
  };

  const nudge = (delta, edge = 'both') => {
    const ids = selectedIdsOrPrimary();
    if (!ids.size) return;
    commit(prev => nudgeCues(prev, ids, delta, edge), 'Nudge timing', `nudge:${edge}:${[...ids].join(',')}`);
  };

  const setEdgeToPlayhead = (edge) => {
    const { sel: s, video: v, currentMs: now } = latest.current;
    if (s.primary == null) return;
    if (!v) { toast.warn('Open a video first — the playhead sets the time.'); return; }
    const next = setCueEdge(latest.current.cues, s.primary, edge, now);
    if (!next) { toast.warn('End must be after the start. Move the playhead later.'); return; }
    commit(next, edge === 'start' ? 'Set start' : 'Set end');
  };

  const handleImport = (imported, { mode, fileName }) => {
    if (mode === 'append') {
      commit(prev => [...prev, ...imported].map((c, i) => [c, i])
        .sort((a, b) => a[0].startMs - b[0].startMs || a[1] - b[1]).map(([c]) => c), `Add ${plural(imported.length, 'cue')}`);
      toast.success(`Added ${plural(imported.length, 'cue')} from ${fileName}`, { action: { label: 'Undo', onClick: undoFromToast } });
      return;
    }
    commit(imported, 'Import');
    setSel({ ids: EMPTY_SET, primary: null, anchor: null });
    toast.success(`Imported ${plural(imported.length, 'cue')} from ${fileName}`, { action: { label: 'Undo', onClick: undoFromToast } });
  };

  const openImport = (file = null) => { setImportFile(file); setImportOpen(true); };

  // ---------------------------------------------------------------
  // Quality check
  // ---------------------------------------------------------------
  const issues = useMemo(() => checkCues(cues, qcSettings), [cues, qcSettings]);
  const qcSummary = useMemo(() => summarize(issues), [issues]);
  const issueLevels = useMemo(() => (qcOpen ? levelsById(issues) : EMPTY_MAP), [qcOpen, issues]);

  const handleQcFix = ({ rules, ids = null }) => {
    const { cues: next, fixed } = applyFixes(latest.current.cues, qcSettings, { rules, ids });
    if (!fixed) { toast.warn("That one can't be fixed automatically — it needs a manual edit."); return; }
    const what = rules && rules.size === 1 ? RULES[[...rules][0]].label.toLowerCase() : 'issues';
    commit(next, `Fix ${what}`);
    toast.success(`Fixed ${plural(fixed, 'cue')} (${what})`, { action: { label: 'Undo', onClick: undoFromToast } });
  };

  const saveQcSettings = (next) => { setQcSettings(next); writePref('qc', next); };

  // ---------------------------------------------------------------
  // Drag & drop: subtitle files open the import dialog, videos open as the video
  // ---------------------------------------------------------------
  const dragDepth = useRef(0);
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const onDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragKind('files');
  };
  const onDragOver = (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragKind(null);
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragKind(null);
    const item = e.dataTransfer.items?.[0];
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (document.querySelector('.ws-modal-backdrop')) return; // a dialog is open; don't stack another
    const isVideo = file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
    if (isVideo) {
      // A file handle (Chromium) lets the video come back after a reload without copying it.
      const handlePromise = item?.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null);
      handlePromise.then(handle => applyVideoFile(file, handle && handle.kind === 'file' ? handle : null));
      return;
    }
    if (SUB_EXT.test(file.name) || file.type.startsWith('text/') || file.type === '') { openImport(file); return; }
    toast.warn(`"${file.name}" isn't a subtitle or video file.`);
  };

  // Find & replace callbacks
  const handleFindJump = useCallback((id) => selectOnly(id, { seekTo: true }), [selectOnly]);

  // ---------------------------------------------------------------
  // Waveform timeline
  // ---------------------------------------------------------------
  useEffect(() => {
    const file = video?.file;
    if (!file || !projectName) { setWave({ state: 'novideo' }); return undefined; }
    let cancelled = false;
    setWave({ state: 'loading', text: 'Reading audio…' });
    getPeaks(projectName, file, {
      onStage: (text) => { if (!cancelled) setWave(w => ({ ...w, state: 'loading', text, progress: null })); },
      onProgress: (p) => { if (!cancelled) setWave(w => ({ ...w, progress: p })); },
    }).then((r) => {
      if (!cancelled) setWave({ state: 'ready', peaks: { data: r.peaks, perSec: r.perSec }, durationMs: r.durationMs, method: r.method });
    }).catch((err) => {
      console.error(err);
      if (!cancelled) setWave({ state: 'error', text: err?.message && err.message.length < 90 ? err.message : '' });
    });
    return () => { cancelled = true; };
  }, [video, projectName, waveRetry]);

  const timelineDurationMs = useMemo(() => {
    const lastEnd = cues.reduce((m, c) => Math.max(m, c.endMs), 0);
    return Math.max(videoDurMs, wave.durationMs || 0, lastEnd + 5000, 30000);
  }, [cues, videoDurMs, wave.durationMs]);

  const getMediaMs = useCallback(() => {
    const t = playerRef.current?.getCurrentTime?.();
    return Number.isFinite(t) ? t * 1000 : null;
  }, []);

  // ---------------------------------------------------------------
  // Playback aids: speed, loop, rewind on pause
  // ---------------------------------------------------------------
  const changeRate = useCallback((r) => { setRate(r); writePref('rate', r); }, []);

  const mediaEl = () => {
    const el = playerRef.current?.getInternalPlayer?.();
    return el && typeof el.play === 'function' ? el : null;
  };

  const handlePause = () => {
    // A 'pause' event can arrive late — after typing mode has already resumed playback.
    // If the video is actually playing again, it's stale: ignore it.
    const el = mediaEl();
    if (el && !el.paused) return;
    setIsPlaying(false);
    if (skipRewindRef.current) { skipRewindRef.current = false; return; }
    if (rewindSec > 0) {
      const t = getMediaMs();
      if (t != null) seek(t - rewindSec * 1000, { user: false });
    }
  };

  /** Pause without the rewind-on-pause behaviour (used by typing mode). */
  const pauseQuietly = () => { skipRewindRef.current = true; setIsPlaying(false); mediaEl()?.pause(); };

  /** Play now. Calls the element directly so a quick pause → play can't get lost in the player library. */
  const playNow = () => {
    setIsPlaying(true);
    const p = mediaEl()?.play();
    if (p && p.catch) p.catch(() => {});
  };

  const loopRange = useMemo(() => (loop ? loopRangeFor(cues, sel.ids, sel.primary) : null), [loop, cues, sel.ids, sel.primary]);

  const toggleLoop = () => {
    if (loop) { setLoop(false); return; }
    if (!loopRangeFor(latest.current.cues, latest.current.sel.ids, latest.current.sel.primary)) {
      toast.info('Select a cue (or several) to loop.');
      return;
    }
    setLoop(true);
  };

  // Jump into the loop when it starts or the looped cue changes.
  useEffect(() => {
    if (!loopRange || !video) return;
    const t = latest.current.currentMs;
    if (t < loopRange.startMs || t >= loopRange.endMs) seek(loopRange.startMs, { user: false });
  }, [loopRange, video, seek]);

  // While playing, wrap back to the start of the loop.
  useEffect(() => {
    if (!loopRange || !isPlaying) return undefined;
    let raf = 0;
    const tick = () => {
      const t = getMediaMs();
      if (t != null && (t >= loopRange.endMs || t < loopRange.startMs - 250)) seek(loopRange.startMs, { user: false });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loopRange, isPlaying, getMediaMs, seek]);

  // ---------------------------------------------------------------
  // Typing mode
  // ---------------------------------------------------------------
  const enterTyping = () => {
    setTyping(true);
    setTypeText('');
    setTypedCount(0);
    typedEndRef.current = null;
    setSegStartMs(latest.current.currentMs);
    setTimeout(() => typeRef.current?.focus(), 30);
  };
  const exitTyping = () => {
    setTyping(false);
    typedEndRef.current = null;
    autoPausedRef.current = false;
  };
  const toggleTyping = () => (latest.current.typing ? exitTyping() : enterTyping());

  const resumeIfAutoPaused = () => {
    if (autoPausedRef.current) { autoPausedRef.current = false; playNow(); }
  };

  const handleTypeChange = (value) => {
    // The first character marks the end of the phrase being typed.
    if (!typeText.trim() && value.trim()) {
      const t = getMediaMs();
      typedEndRef.current = t != null ? t : latest.current.currentMs;
      if (pauseOnType && latest.current.isPlaying) { autoPausedRef.current = true; pauseQuietly(); }
    }
    if (!value.trim()) typedEndRef.current = null;
    setTypeText(value);
  };

  const commitTyped = () => {
    const text = typeText.trim();
    if (!text) return;
    const end = typedEndRef.current ?? getMediaMs() ?? latest.current.currentMs;
    const range = typedCueRange(segStartMs, end, text);
    const cue = makeCue({ ...range, text });
    commit(prev => insertByStart(prev, cue), 'Typed cue');
    setSegStartMs(range.endMs);
    setTypeText('');
    setTypedCount(n => n + 1);
    typedEndRef.current = null;
    requestAnimationFrame(() => scrollToCue(cue.id));
    resumeIfAutoPaused();
  };

  const handleTypeKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); commitTyped(); return; }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      setTypeText(''); typedEndRef.current = null;
      resumeIfAutoPaused();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        const t = getMediaMs() ?? latest.current.currentMs;
        seek(t - 2000, { user: false });
      } else {
        autoPausedRef.current = false;
        if (latest.current.isPlaying) pauseQuietly(); else playNow();
      }
    }
  };

  const setPauseOnTypePref = (v) => { setPauseOnType(v); writePref('pauseOnType', v); };
  const changeRewind = (v) => { setRewindSec(v); writePref('rewind', v); };

  const handleTimelineSelect = useCallback((id, mods = {}) => {
    if (mods.ctrl) toggleInSelection(id);
    else if (mods.shift) selectRangeTo(id);
    else selectOnly(id);
  }, [toggleInSelection, selectRangeTo, selectOnly]);

  const handleTimelineEdit = useCallback((next, label, key) => commit(next, label, key), [commit]);

  const handleTimelineCreate = useCallback((startMs, endMs) => {
    const cue = makeCue({ startMs, endMs, text: '' });
    commit(prev => insertByStart(prev, cue), 'New cue');
    focusTextNext.current = true;
    setSel({ ids: new Set([cue.id]), primary: cue.id, anchor: cue.id });
    requestAnimationFrame(() => scrollToCue(cue.id));
  }, [commit, scrollToCue]);

  const handleTimelineActivate = useCallback((id) => {
    selectOnly(id);
    focusTextNext.current = true;
    setTimeout(() => textRef.current?.focus(), 30);
  }, [selectOnly]);

  const toggleWave = useCallback(() => setWaveOpen(o => { writePref('wave', !o); return !o; }), []);
  const handleReplaceOne = useCallback((id, re, rep, regex) => {
    commit(prev => replaceInCues(prev, re, rep, { regex, ids: new Set([id]) }).cues, 'Replace');
  }, [commit]);
  const handleReplaceAll = useCallback((re, rep, regex) => {
    const { cues: next, count } = replaceInCues(latest.current.cues, re, rep, { regex });
    if (!count) return;
    commit(next, `Replace ${plural(count, 'match', 'matches')}`);
    toast.success(`Replaced ${plural(count, 'match', 'matches')}`, { action: { label: 'Undo', onClick: undoFromToast } });
  }, [commit, toast, undoFromToast]);

  const openFind = () => { setFindOpen(true); setFindFocusSignal(n => n + 1); };
  const openShift = (scope) => { setShiftScope(scope); setShiftOpen(true); };
  const toggleFollow = () => setFollow(f => { writePref('follow', !f); return !f; });

  // ---------------------------------------------------------------
  // Keyboard — registered once, always calls the latest handler
  // ---------------------------------------------------------------
  const keyHandler = useRef(null);
  keyHandler.current = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const modalOpen = Boolean(document.querySelector('.ws-modal-backdrop'));
    const el = document.activeElement;
    const isTyping = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

    // Work everywhere, including inside fields
    if (mod && key === 's') { e.preventDefault(); flushSave().then(() => toast.success('Saved')); return; }
    if (modalOpen) return;
    if (mod && key === 'f') { e.preventDefault(); openFind(); return; }
    if (mod && key === 'o') { e.preventDefault(); openImport(); return; }
    if (mod && key === 'k') { e.preventDefault(); if (latest.current.video) toggleTyping(); else toast.info('Open a video first to use typing mode.'); return; }
    if (mod && e.shiftKey && key === 'e') { e.preventDefault(); if (latest.current.cues.length) setExportOpen(true); return; }

    if (isTyping) return; // fields keep native behaviour (including their own Ctrl+Z)

    if (mod) {
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
      else if (key === 'a') {
        e.preventDefault();
        const list = latest.current.cues;
        if (list.length) setSel(s => ({ ids: new Set(list.map(c => c.id)), primary: s.primary ?? list[0].id, anchor: s.anchor ?? list[0].id }));
      }
      return;
    }
    if (e.altKey) return;

    const list = latest.current.cues;
    const idx = primaryIndex;

    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlay(); return;
      case 'ArrowLeft': e.preventDefault(); seek(latest.current.currentMs - (e.shiftKey ? 5000 : 1000)); return;
      case 'ArrowRight': e.preventDefault(); seek(latest.current.currentMs + (e.shiftKey ? 5000 : 1000)); return;
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!list.length) return;
        e.preventDefault();
        const down = e.code === 'ArrowDown';
        const next = idx == null ? 0 : down ? Math.min(idx + 1, list.length - 1) : Math.max(idx - 1, 0);
        if (e.shiftKey) selectRangeTo(list[next].id); else selectOnly(list[next].id, { seekTo: true });
        return;
      }
      case 'Home': if (list.length) { e.preventDefault(); selectOnly(list[0].id, { seekTo: true }); } return;
      case 'End': if (list.length) { e.preventDefault(); selectOnly(list[list.length - 1].id, { seekTo: true }); } return;
      case 'Enter': if (primaryCue) { e.preventDefault(); textRef.current?.focus(); } return;
      case 'Escape': setSel({ ids: EMPTY_SET, primary: null, anchor: null }); return;
      case 'Delete':
      case 'Backspace': {
        const ids = selectedIdsOrPrimary();
        if (ids.size) { e.preventDefault(); requestDelete(ids); }
        return;
      }
      case 'BracketLeft': e.preventDefault(); nudge(-(e.shiftKey ? 10 : 1) * NUDGE_MS); return;
      case 'BracketRight': e.preventDefault(); nudge((e.shiftKey ? 10 : 1) * NUDGE_MS); return;
      default: break;
    }

    if (e.key === '?') { e.preventDefault(); setHelpOpen(true); return; }
    if (e.key === '<' || e.key === '>') { e.preventDefault(); changeRate(stepSpeed(rate, e.key === '>' ? 1 : -1)); return; }
    if (e.key === '=' || e.key === '+') { e.preventDefault(); timelineRef.current?.zoomIn(); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); timelineRef.current?.zoomOut(); return; }
    if (e.shiftKey) return;
    if (key === 'm') mergeSelection();
    else if (key === 's') splitPrimary();
    else if (key === 'i') setEdgeToPlayhead('start');
    else if (key === 'o') setEdgeToPlayhead('end');
    else if (key === 'n') { e.preventDefault(); newCueAtPlayhead(); }
    else if (key === 'q') { e.preventDefault(); setQcOpen(o => !o); }
    else if (key === 'w') { e.preventDefault(); toggleWave(); }
    else if (key === 't') { e.preventDefault(); if (latest.current.cues.length) setToolsOpen(true); }
    else if (key === 'l') { e.preventDefault(); toggleLoop(); }

  };

  useEffect(() => {
    const h = (e) => keyHandler.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ---------------------------------------------------------------
  // Derived for render
  // ---------------------------------------------------------------
  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved';
  const multiRange = multi ? selectionRange(cues, sel.ids) : null;

  const draftStats = useMemo(() => {
    if (!draft || !primaryCue) return null;
    const s = parseTime(draft.startTime);
    const e = parseTime(draft.endTime);
    return cueStats({
      startMs: Number.isNaN(s) ? primaryCue.startMs : s,
      endMs: Number.isNaN(e) ? primaryCue.endMs : e,
      text: draft.text,
    }, qcSettings);
  }, [draft, primaryCue, qcSettings]);
  const LIMITS = qcSettings;

  return (
    <div className="workspace" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {dragKind && (
        <div className="ws-drop-overlay" aria-hidden="true">
          <div className="ws-drop-card">
            <div className="big">Drop to open</div>
            <div>Subtitles (SRT, VTT, ASS, SBV, TXT) are imported · Videos open in the player</div>
          </div>
        </div>
      )}
      <div className="ws-toolbar">
        <button className="ws-logo ws-logo-btn" onClick={() => navigate('/')} title="Back to projects">[SRT Creator]</button>
        {projectName && <span className="ws-project-name" title={projectName}>{projectName}</span>}
        <span className={`ws-save-state ${saveState}`}>{loaded ? saveLabel : 'Loading…'}</span>

        <div className="ws-group">
          <button className="ws-btn ws-btn-icon" onClick={undo} disabled={!history.canUndo}
                  title={history.canUndo ? `Undo: ${history.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} aria-label="Undo">↶</button>
          <button className="ws-btn ws-btn-icon" onClick={redo} disabled={!history.canRedo}
                  title={history.canRedo ? `Redo: ${history.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'} aria-label="Redo">↷</button>
        </div>

        <div className="ws-group">
          <button className="ws-btn" onClick={() => openImport()} title="Import SRT, VTT, ASS, SBV or TXT (Ctrl+O) — or drop a file">Import</button>
          <ExportSrt cues={cues} defaultName={projectName} show={exportOpen} setShow={setExportOpen} />
        </div>

        <div className="ws-group">
          <button className="ws-btn" onClick={openFind} title="Find & replace (Ctrl+F)">Find</button>
          <button className={`ws-btn ws-qc-btn${qcOpen ? ' on' : ''}`} onClick={() => setQcOpen(o => !o)} disabled={cues.length === 0 && !qcOpen}
                  title="Quality check (Q)">
            Check
            {cues.length > 0 && (
              <span className={`ws-badge ${qcSummary.errors ? 'error' : qcSummary.warnings ? 'warning' : 'ok'}`}>
                {qcSummary.errors + qcSummary.warnings || '✓'}
              </span>
            )}
          </button>
          <button className="ws-btn" onClick={() => openShift(multi ? 'selected' : 'all')} disabled={cues.length === 0}>Shift timing</button>
          <button className="ws-btn" onClick={() => setToolsOpen(true)} disabled={cues.length === 0}
                  title="Sync and text clean-up tools (T)">Tools</button>
          <BulkDelete
            cues={cues}
            setCues={(next) => commit(next, 'Bulk delete')}
            onDeleted={(ids) => {
              toast.success(`Deleted ${plural(ids.length, 'cue')}`, { action: { label: 'Undo', onClick: undoFromToast } });
            }}
          />
        </div>

        <div className="ws-spacer" />

        <button className="ws-btn ws-btn-icon" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
        <button className="ws-btn primary" onClick={openVideo}>{video ? 'Change video' : 'Open video'}</button>
        <input type="file" hidden ref={fileInputRef} accept="video/*" onChange={handleFileInput} />
      </div>

      <div className="ws-main">
        {/* ---------------- VIDEO PANE ---------------- */}
        <section className="ws-pane video">
          <div className="ws-pane-header">
            <span className="ws-pane-title" title={video?.name}>{video ? video.name : 'Preview'}</span>
            <span className="ws-pane-header-right">
              {video && (
                <span className="ws-sub-size" role="group" aria-label="Subtitle size on the preview">
                  <button className="ws-icon-btn" onClick={() => changeSubScale(-0.1)} disabled={subScale <= 0.6} title="Smaller subtitles on the preview" aria-label="Smaller subtitles">A−</button>
                  <span title="Subtitle size on the preview">{Math.round(subScale * 100)}%</span>
                  <button className="ws-icon-btn" onClick={() => changeSubScale(0.1)} disabled={subScale >= 2} title="Larger subtitles on the preview" aria-label="Larger subtitles">A+</button>
                </span>
              )}
              <span>{plural(cues.length, 'cue')}</span>
            </span>
          </div>

          <div className="ws-video-wrap">
            {video ? (
              <ReactPlayer
                key={video.url}
                ref={playerRef}
                className="react-player"
                url={video.url}
                width="100%"
                height="100%"
                controls
                progressInterval={100}
                onReady={() => setPlayerReady(true)}
                onDuration={(d) => setVideoDurMs(Math.round((d || 0) * 1000))}
                onProgress={handleProgress}
                onSeek={(sec) => setCurrentMs(secondsToMs(sec))}
                onError={() => toast.error("This browser can't play that video. Try an MP4 (H.264/AAC) file.")}
                playing={isPlaying}
                playbackRate={rate}
                onPlay={() => setIsPlaying(true)}
                onPause={handlePause}
              />
            ) : null}
            {video && (
              <SubtitleOverlay
                cues={cues}
                currentMs={currentMs}
                isPlaying={isPlaying}
                getMediaMs={getMediaMs}
                scale={subScale}
                hidden={videoFullscreen}
              />
            )}
            {!video && (pendingVideo ? (
              <div className="ws-empty-video">
                <div>Video not loaded</div>
                <div className="ws-empty-video-name">{pendingVideo.name}</div>
                <button className="ws-btn primary" onClick={reconnectVideo}>
                  {pendingVideo.kind === 'handle' ? 'Reconnect video' : 'Reopen video'}
                </button>
              </div>
            ) : (
              <div className="ws-empty-video">
                <div>No video loaded</div>
                <button className="ws-btn primary" onClick={openVideo}>Open a video</button>
              </div>
            ))}
          </div>

          <div className="ws-video-meta">
            <span className="ws-meta-label">Position</span>
            <span className="tc">{currentTime}</span>
            <span className="ws-spacer" />
            <button className="ws-btn" onClick={newCueAtPlayhead} title="New cue at playhead (N)">+ Cue here <span className="ws-kbd">N</span></button>
            <button className="ws-btn" onClick={togglePlay} disabled={!video}>
              {isPlaying ? 'Pause' : 'Play'} <span className="ws-kbd">Space</span>
            </button>
          </div>

          <div className="ws-playbar">
            <label className="ws-pb-item" title="Playback speed (< and >)">
              <span>Speed</span>
              <select className="ws-pb-select" value={rate} onChange={(e) => changeRate(Number(e.target.value))} aria-label="Playback speed">
                {SPEEDS.map(r => <option key={r} value={r}>{r}×</option>)}
              </select>
            </label>
            <button className={`ws-chip${loop ? ' on' : ''}`} onClick={toggleLoop} disabled={!video}
                    title="Loop the selected cue — or the span of a multi-selection (L)" aria-pressed={loop}>⟲ Loop</button>
            <label className="ws-pb-item" title="After you pause, jump back so you can re-listen">
              <span>Rewind on pause</span>
              <select className="ws-pb-select" value={rewindSec} onChange={(e) => changeRewind(Number(e.target.value))} aria-label="Rewind on pause">
                {[0, 1, 2, 3, 5].map(v => <option key={v} value={v}>{v ? `${v}s` : 'Off'}</option>)}
              </select>
            </label>
            <span className="ws-spacer" />
            <button className={`ws-btn ws-typing-btn${typing ? ' primary' : ''}`} onClick={toggleTyping} disabled={!video}
                    title="Type while the video plays; Enter adds a timed cue (Ctrl+K)" aria-pressed={typing}>⌨ Typing mode</button>
          </div>

          {typing ? (
            <TypingPanel
              ref={typeRef}
              text={typeText}
              onChange={handleTypeChange}
              onKeyDown={handleTypeKeyDown}
              segStartMs={segStartMs}
              onStartHere={() => setSegStartMs(getMediaMs() ?? currentMs)}
              pauseOnType={pauseOnType}
              onPauseOnType={setPauseOnTypePref}
              onExit={exitTyping}
              isPlaying={isPlaying}
              videoLoaded={Boolean(video)}
              count={typedCount}
            />
          ) : (
          <div className="ws-quick-add">
            <div className="ws-field">
              <label htmlFor="startTime">Start</label>
              <input id="startTime" className="ws-input" value={row.startTime}
                     onChange={handleQuickTime} placeholder="00:00:00,000" inputMode="numeric" />
            </div>
            <div className="ws-field">
              <label htmlFor="endTime">End</label>
              <input id="endTime" className="ws-input" value={row.endTime}
                     onChange={handleQuickTime} placeholder="00:00:00,000" inputMode="numeric" />
            </div>
            <div className="ws-field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="quickText">Text <span className="ws-label-hint">Enter adds · Shift+Enter new line</span></label>
              <textarea id="quickText" className="ws-input text ws-quick-text" rows={2} value={row.text}
                        onChange={(e) => setRow(r => ({ ...r, text: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCue(); } }}
                        placeholder="Subtitle text" />
            </div>
            <button className="ws-btn" onClick={() => setRow(r => ({ ...r, startTime: currentTime }))}>Set start = {currentTime.slice(0, 8)}</button>
            <button className="ws-btn" onClick={() => setRow(r => ({ ...r, endTime: currentTime }))}>Set end = {currentTime.slice(0, 8)}</button>
            <button className="ws-btn primary" onClick={addCue}>Add cue</button>
          </div>
          )}
        </section>

        {/* ---------------- TIMELINE PANE ---------------- */}
        <section className="ws-pane timeline">
          <div className="ws-pane-header">
            <span>Timeline</span>
            <span className="ws-pane-header-right">
              <span>
                {multi ? `${sel.ids.size} selected` : primaryIndex != null ? `Selected #${primaryIndex + 1}` : 'None selected'}
              </span>
              <button className={`ws-chip${follow ? ' on' : ''}`} onClick={toggleFollow}
                      title="Scroll the list to follow the video while it plays">Follow</button>
            </span>
          </div>

          <FindReplace
            open={findOpen}
            focusSignal={findFocusSignal}
            cues={cues}
            primaryIndex={primaryIndex}
            onClose={() => setFindOpen(false)}
            onJump={handleFindJump}
            onReplaceOne={handleReplaceOne}
            onReplaceAll={handleReplaceAll}
            onMatchIds={setMatchIds}
          />

          <div className="ws-pane-body">
            {!loaded ? (
              <div className="ws-timeline-empty">Loading project…</div>
            ) : cues.length === 0 ? (
              <div className="ws-timeline-empty">
                No cues yet. Add one from the panel on the left, press <b>N</b> to add one at the playhead, or import an .srt file.
              </div>
            ) : (
              <div className="ws-timeline-list" role="listbox" aria-multiselectable="true">
                {cues.map((cue, index) => (
                  <CueRow
                    key={cue.id}
                    cue={cue}
                    index={index}
                    isLast={index === cues.length - 1}
                    selected={sel.ids.has(cue.id)}
                    primary={sel.primary === cue.id}
                    issue={issueLevels.get(cue.id) || null}
                    playing={playingId === cue.id}
                    match={matchIds.has(cue.id)}
                    onRowMouseDown={handleRowMouseDown}
                    onRowClick={handleRowClick}
                    onMerge={mergeAt}
                    onDelete={handleRowDelete}
                    rowRef={setRowEl}
                  />
                ))}
              </div>
            )}
          </div>
          <QualityPanel
            open={qcOpen}
            onClose={() => setQcOpen(false)}
            issues={issues}
            settings={qcSettings}
            onSettings={saveQcSettings}
            primaryId={sel.primary}
            onJump={handleFindJump}
            onFix={handleQcFix}
          />
          <div className="ws-hotkey-bar">
            <span><b>Space</b> play</span>
            <span><b>↑↓</b> select</span>
            <span><b>I / O</b> set start / end</span>
            <span><b>[ ]</b> nudge</span>
            <span><b>N</b> new cue</span>
            <span><b>Ctrl+Z</b> undo</span>
            <span><b>Q</b> check</span>
            <span><b>W</b> waveform</span>
            <button className="ws-linklike" onClick={() => setHelpOpen(true)}><b>?</b> all shortcuts</button>
          </div>
        </section>

        {/* ---------------- PROPERTIES PANE ---------------- */}
        <section className="ws-pane props">
          <div className="ws-pane-header">
            <span>Properties</span>
          </div>
          <div className="ws-pane-body ws-props-body">
            {multi ? (
              <>
                <div className="ws-props-multi">
                  <div className="big">{sel.ids.size} cues selected</div>
                  {multiRange && (
                    <div className="ws-props-meta-inline">
                      #{multiRange.lo + 1}–#{multiRange.hi + 1}{multiRange.contiguous ? '' : ' (not all neighbours)'}
                    </div>
                  )}
                </div>
                <div className="ws-props-group">
                  <label>Nudge timing</label>
                  <div className="ws-props-actions">
                    <button className="ws-btn" onClick={() => nudge(-NUDGE_MS)} title="[">−100ms</button>
                    <button className="ws-btn" onClick={() => nudge(NUDGE_MS)} title="]">+100ms</button>
                    <button className="ws-btn" onClick={() => openShift('selected')}>Shift by…</button>
                  </div>
                </div>
                <div className="ws-props-actions">
                  <button className="ws-btn" onClick={mergeSelection} disabled={!multiRange?.contiguous}
                          title={multiRange?.contiguous ? 'Merge into one cue (M)' : 'Only neighbouring cues can be merged'}>Merge</button>
                  <button className="ws-btn danger" onClick={() => requestDelete(sel.ids)}>Delete {sel.ids.size}</button>
                </div>
                <div className="ws-props-meta">Shift+Click selects a range · Ctrl+Click adds or removes · Esc clears</div>
              </>
            ) : draft && primaryCue ? (
              <>
                <div className="ws-props-row">
                  <div className="ws-props-field">
                    <label>
                      Start
                      <button className="ws-mini-btn" onClick={() => setEdgeToPlayhead('start')} disabled={!video} title="Set to playhead (I)">⇤ playhead</button>
                    </label>
                    <input className="ws-input" value={draft.startTime} inputMode="numeric" aria-label="Start time"
                           onChange={(e) => handleDraftChange('startTime', e.target.value)}
                           onKeyDown={handleFieldKeyDown}
                           onBlur={handleFieldBlur} />
                  </div>
                  <div className="ws-props-field">
                    <label>
                      End
                      <button className="ws-mini-btn" onClick={() => setEdgeToPlayhead('end')} disabled={!video} title="Set to playhead (O)">playhead ⇥</button>
                    </label>
                    <input className="ws-input" value={draft.endTime} inputMode="numeric" aria-label="End time"
                           onChange={(e) => handleDraftChange('endTime', e.target.value)}
                           onKeyDown={handleFieldKeyDown}
                           onBlur={handleFieldBlur} />
                  </div>
                </div>
                <div className="ws-props-field">
                  <label>Text</label>
                  <textarea ref={textRef} className="ws-input" value={draft.text} aria-label="Cue text"
                            onChange={(e) => handleDraftChange('text', e.target.value)}
                            onSelect={trackCaret} onKeyUp={trackCaret} onClick={trackCaret}
                            onKeyDown={handleFieldKeyDown}
                            onBlur={handleFieldBlur}
                            spellCheck />
                </div>

                {draftStats && (
                  <div className="ws-stats">
                    <span className={draftStats.flags.tooShort || draftStats.flags.tooLong ? 'warn' : ''}
                          title={`Recommended ${LIMITS.minDurationMs / 1000}–${LIMITS.maxDurationMs / 1000}s`}>
                      {(draftStats.durationMs / 1000).toFixed(3)}s
                    </span>
                    <span className={draftStats.flags.cps ? 'warn' : ''} title={`Characters per second — aim for ≤ ${LIMITS.maxCps}`}>
                      {Number.isFinite(draftStats.cps) ? draftStats.cps.toFixed(1) : '∞'} CPS
                    </span>
                    <span className={draftStats.flags.lines ? 'warn' : ''} title={`Aim for ≤ ${LIMITS.maxLines} lines`}>
                      {plural(draftStats.lineCount, 'line')}
                    </span>
                    <span className={draftStats.flags.lineLength ? 'warn' : ''} title={`Longest line — aim for ≤ ${LIMITS.maxLineLength} characters`}>
                      {draftStats.maxLineLength}/{LIMITS.maxLineLength} chars
                    </span>
                  </div>
                )}

                <div className="ws-props-actions">
                  <button className="ws-btn primary" onClick={saveDraft} title="Ctrl+Enter in a field">Save</button>
                  <button className="ws-btn" onClick={resetDraft} title="Esc in a field">Revert</button>
                  <button className="ws-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => splitPrimary({ useDraft: true })}
                          title="Split at the text cursor; the time cut uses the playhead when it's inside the cue (S)">Split</button>
                  <button className="ws-btn danger" onClick={() => requestDelete([primaryCue.id])}>Delete</button>
                </div>
                <div className="ws-props-group">
                  <label>Nudge</label>
                  <div className="ws-props-actions">
                    <button className="ws-btn" onClick={() => nudge(-NUDGE_MS)} title="[">−100ms</button>
                    <button className="ws-btn" onClick={() => nudge(NUDGE_MS)} title="]">+100ms</button>
                    <button className="ws-btn" onClick={() => seek(primaryCue.startMs)} disabled={!video} title="Jump the video to this cue">▶ Go to cue</button>
                    {primaryIndex > 0 && (
                      <button className="ws-btn" onClick={() => openShift('from')} title="Shift this cue and every cue after it">Shift from here…</button>
                    )}
                  </div>
                </div>
                <div className="ws-props-meta">Cue #{primaryIndex + 1} of {cues.length}</div>
              </>
            ) : (
              <div className="ws-props-empty">
                Select a cue in the timeline to edit its timing and text here.
                <br /><br />Shift+Click or Ctrl+Click to select several.
              </div>
            )}
          </div>
        </section>
      </div>

      <WaveformTimeline
        ref={timelineRef}
        cues={cues}
        selIds={sel.ids}
        primaryId={sel.primary}
        issueLevels={issueLevels}
        currentMs={currentMs}
        getMediaMs={video ? getMediaMs : null}
        durationMs={timelineDurationMs}
        isPlaying={isPlaying}
        follow={follow}
        peaks={wave.state === 'ready' ? wave.peaks : null}
        status={wave}
        collapsed={!waveOpen}
        onToggle={toggleWave}
        onRetry={() => setWaveRetry(n => n + 1)}
        onSeek={seek}
        onSelect={handleTimelineSelect}
        onEdit={handleTimelineEdit}
        onCreate={handleTimelineCreate}
        onActivate={handleTimelineActivate}
      />

      <DeleteEntry
        showDelete={delIds != null}
        count={delIds?.length || 0}
        handleClose={() => setDelIds(null)}
        handleDelete={handleDeleteConfirmed}
      />
      <ShiftTiming
        show={shiftOpen}
        onClose={() => setShiftOpen(false)}
        cues={cues}
        selectedIds={sel.ids}
        fromIndex={!multi ? primaryIndex : null}
        defaultScope={shiftScope}
        onApply={(next, { count, clamped }) => {
          commit(next, `Shift ${plural(count, 'cue')}`);
          toast.success(`Shifted ${plural(count, 'cue')}${clamped ? ` — ${clamped} stopped at 00:00:00,000` : ''}`,
            { action: { label: 'Undo', onClick: undoFromToast } });
        }}
      />
      <Tools
        show={toolsOpen}
        onClose={() => setToolsOpen(false)}
        cues={cues}
        selectedIds={sel.ids}
        primaryIndex={primaryIndex}
        currentMs={currentMs}
        videoLoaded={Boolean(video)}
        limits={qcSettings}
        onApply={(next, label, { changed, removed }) => {
          commit(next, label);
          toast.success(`${label}: ${plural(changed, 'cue')} changed${removed ? `, ${plural(removed, 'cue')} removed` : ''}`,
            { action: { label: 'Undo', onClick: undoFromToast } });
        }}
      />
      <ImportSrt
        show={importOpen}
        onClose={() => { setImportOpen(false); setImportFile(null); }}
        initialFile={importFile}
        hasCues={cues.length > 0}
        onImport={handleImport}
      />
      <ShortcutsHelp show={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default Workspace;
