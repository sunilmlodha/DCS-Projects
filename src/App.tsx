import { useState, useCallback, useEffect, useMemo } from 'react';
import { personas } from './data/personas';
import { stageConfigs } from './data/cdh';
import { platforms, defaultPlatformByPersona } from './data/platforms';
import type { Persona } from './data/types';
import type { Platform } from './data/platforms';
import CandidateProfile from './components/CandidateProfile';
import CDHApiPanel from './components/CDHApiPanel';
import SimpleMobile from './components/SimpleMobile';
import WebPortal from './components/WebPortal';
import PersonaBuilder from './components/PersonaBuilder';
import { useTheme, useThemeColors, THEMES } from './context/ThemeContext';
import { useCapture } from './hooks/useCapture';
import { useStageView } from './hooks/useStageView';
import { useCDHConfig } from './hooks/useCDHConfig';
import { useCDHLiveCall } from './hooks/useCDHLiveCall';

type ViewMode = 'mobile' | 'web';

// Maps each service to the stageConfigs key that has its journey defined
const SERVICE_STAGE_KEY: Record<string, string> = {
  army: 'james',
  navy: 'sarah',
  raf: 'george',
};

const PHASE_GROUPS = [
  { phaseNum: 1, label: 'Phase 1', sub: 'Attract & Engage',   stages: [1, 2] },
  { phaseNum: 2, label: 'Phase 2', sub: 'Apply & Medical Q',  stages: [3, 4, 5] },
  { phaseNum: 3, label: 'Phase 3', sub: 'Medical & Vetting',  stages: [6, 7] },
  { phaseNum: 4, label: 'Phase 4', sub: 'Selection & AC',     stages: [8, 9, 10, 11] },
  { phaseNum: 5, label: 'Phase 5', sub: 'Offer & Training',   stages: [12, 13] },
];

const STORAGE_KEY = 'arfs-custom-personas';

function loadSavedPersonas(): Persona[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export default function App() {
  // ── Navigation state ───────────────────────────────────────────────────────
  const [selectedPersona, setSelectedPersona] = useState<Persona>(personas[0]);
  const [selectedPhase, setSelectedPhase] = useState(1);
  const [selectedStage, setSelectedStage] = useState(1);
  const [nbaReady, setNBAReady] = useState(false);
  const [apiKey, setApiKey] = useState(0);
  const [activePlatform, setActivePlatform] = useState<Platform>(
    platforms.find((p) => p.id === defaultPlatformByPersona['james'])!
  );

  // ── UI toggle state ────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('mobile');
  const [showCDHPanel, setShowCDHPanel] = useState(false);

  // ── Theme (from context — set by ThemeProvider in main.tsx) ───────────────
  const { theme, themeId, setThemeId } = useTheme();
  const { tx, tm, ts } = useThemeColors();

  // ── Persona management ─────────────────────────────────────────────────────
  const [savedPersonas, setSavedPersonas] = useState<Persona[]>(loadSavedPersonas);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editPersona, setEditPersona] = useState<Persona | null>(null);

  // ── Stage resolution ───────────────────────────────────────────────────────
  const stageKey = SERVICE_STAGE_KEY[selectedPersona.service] ?? selectedPersona.id;
  const stages = stageConfigs[stageKey] ?? stageConfigs['james'];
  const stage = stages.find((s) => s.id === selectedStage) ?? stages[0];

  // ── CDH live configuration + API call ──────────────────────────────────────
  const { config: cdhConfig, updateConfig: updateCDHConfig, resetConfig: resetCDHConfig } = useCDHConfig();
  const cdhLive = useCDHLiveCall(cdhConfig, stage, selectedPersona, activePlatform);

  /**
   * effectiveStage: identical to `stage` except:
   *   • On Stage 1, pageURL is overridden with the active social platform URL.
   *   • When CDH live mode is on and a real response arrived, actions[] are
   *     replaced with the live NBA actions so every downstream view renders
   *     CDH-live content rather than the built-in stageConfigs mock data.
   *
   * useMemo keeps identity stable — children keyed on effectiveStage won't
   * re-mount on unrelated re-renders.
   */
  const effectiveStage = useMemo(() => {
    const base = selectedStage === 1 ? { ...stage, pageURL: activePlatform.url } : stage;
    if (cdhConfig.enabled && cdhLive.liveActions && cdhLive.liveActions.length > 0) {
      return { ...base, actions: cdhLive.liveActions };
    }
    return base;
  }, [stage, selectedStage, activePlatform.url, cdhConfig.enabled, cdhLive.liveActions]);

  // ── Stage view metadata — centralises all stage.id === 1 branching ────────
  const stageView = useStageView(stage, activePlatform, selectedPersona);

  // ── Advance callback (called by useCapture after CTA → done) ─────────────
  const handleAdvance = useCallback((nextStageId: number) => {
    const nextGroup = PHASE_GROUPS.find((g) => g.stages.includes(nextStageId))!;
    setSelectedPhase(nextGroup.phaseNum);
    setSelectedStage(nextStageId);
    setNBAReady(false);
    setApiKey((k) => k + 1);
  }, []);

  // ── Capture state machine ─────────────────────────────────────────────────
  const {
    capturing,
    captured,
    captureRequest,
    captureResponse,
    handleCtaClick,
    resetCapture,
  } = useCapture({
    stage,
    effectivePageURL: effectiveStage.pageURL,
    persona: selectedPersona,
    platform: activePlatform,
    nbaReady,
    onAdvance: handleAdvance,
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const platformForPersona = (p: Persona) =>
    platforms.find((pl) => pl.id === defaultPlatformByPersona[p.id])
    ?? platforms.find((pl) => pl.id === defaultPlatformByPersona[
      p.service === 'army' ? 'james' : p.service === 'navy' ? 'sarah' : 'george'
    ])
    ?? platforms[0];

  const handlePersonaChange = (p: Persona) => {
    setSelectedPersona(p);
    setSelectedPhase(1);
    setSelectedStage(1);
    setNBAReady(false);
    setApiKey((k) => k + 1);
    setActivePlatform(platformForPersona(p));
    // capture resets automatically via useCapture's internal useEffect on persona.id change
  };

  const handlePersonaSaved = (persona: Persona) => {
    setSavedPersonas((prev) => {
      const exists = prev.some((p) => p.id === persona.id);
      const next = exists
        ? prev.map((p) => (p.id === persona.id ? persona : p))
        : [...prev, persona];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    handlePersonaChange(persona);
  };

  const handleEditPersona = (p: Persona) => { setEditPersona(p); setBuilderOpen(true); };

  const handleDeletePersona = (id: string) => {
    setSavedPersonas((prev) => {
      const next = prev.filter((p) => p.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    if (selectedPersona.id === id) handlePersonaChange(personas[0]);
  };

  const openNewBuilder = () => { setEditPersona(null); setBuilderOpen(true); };

  const handlePhaseChange = (phaseNum: number) => {
    const group = PHASE_GROUPS.find((g) => g.phaseNum === phaseNum)!;
    setSelectedPhase(phaseNum);
    setSelectedStage(group.stages[0]);
    setNBAReady(false);
    setApiKey((k) => k + 1);
    // capture resets automatically via useCapture's internal useEffect on stage.id change
  };

  const handleStageChange = (id: number) => {
    const group = PHASE_GROUPS.find((g) => g.stages.includes(id))!;
    setSelectedPhase(group.phaseNum);
    setSelectedStage(id);
    setNBAReady(false);
    setApiKey((k) => k + 1);
  };

  const handlePlatformChange = (p: Platform) => {
    setActivePlatform(p);
    resetCapture(); // platform switch resets any in-progress capture
  };

  // Drive nbaReady independently so it fires even when CDH API panel is hidden
  const handleNBAReady = useCallback(() => setNBAReady(true), []);
  useEffect(() => {
    setNBAReady(false);
    const latency = 900 + Math.floor(Math.random() * 600);
    const t = setTimeout(() => setNBAReady(true), latency);
    return () => clearTimeout(t);
  }, [apiKey]);

  // ── Derived UI values ──────────────────────────────────────────────────────

  // CDH node in the architecture flow bar — reflects whichever decisioning path is active
  const patternArchNode = stage.actions.find((a) => a.ContentFragmentID)
    ? { label: 'CDH Content',    detail: 'Content resolved',            sub: stage.actions.find((a) => a.ContentFragmentID)?.ContentFragmentID?.slice(0, 22) ?? 'CDH Content Studio', color: '#006dcc', icon: '🎨' }
    : stage.actions.find((a) => a.AudienceSegment)
    ? { label: 'CDH Activation', detail: 'Audience pushed (30-120s)',   sub: stage.actions.find((a) => a.AudienceSegment)?.AudienceSegment ?? '–', color: '#006dcc', icon: '👥' }
    : { label: 'CDH Render',     detail: 'Single-platform decisioning', sub: 'CDH Real-Time Container',  color: '#006dcc', icon: '✅' };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: theme.bg, color: tx }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50"
        style={{ background: theme.headerBg, backdropFilter: 'blur(16px)', borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="max-w-screen-xl mx-auto px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex-shrink-0">
            <div className="font-black text-sm leading-tight" style={{ color: tx }}>AFRS Candidate Experience Emulator</div>
            <div className="text-[11px]" style={{ color: tm }}>Pega CDH Real-Time Container · Stages 1–13</div>
          </div>

          {/* Persona picker — preset + saved custom, grouped by service */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['army', 'navy', 'raf'] as const).map((svc) => {
              const svcIcons: Record<string, string> = { army: '⚔️', navy: '⚓', raf: '✈️' };
              const presetList = personas.filter((p) => p.service === svc);
              const customList = savedPersonas.filter((p) => p.service === svc);
              if (presetList.length === 0 && customList.length === 0) return null;
              return (
                <div key={svc} className="flex items-center gap-1">
                  <span className="text-[10px] opacity-60 select-none">{svcIcons[svc]}</span>
                  {/* Preset personas */}
                  {presetList.map((p) => {
                    const active = selectedPersona.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handlePersonaChange(p)}
                        title={`${p.name} · ${p.role}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150"
                        style={{
                          background: active ? p.color : theme.light ? '#e2e8f0' : 'rgba(30,41,59,0.7)',
                          color: active ? 'white' : tm,
                          border: `1px solid ${active ? p.color : theme.border}`,
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-white font-black text-[9px] flex-shrink-0"
                          style={{ background: active ? 'rgba(255,255,255,0.25)' : p.color }}
                        >
                          {p.avatar}
                        </span>
                        {p.name}
                      </button>
                    );
                  })}
                  {/* Saved custom personas */}
                  {customList.map((p) => {
                    const active = selectedPersona.id === p.id;
                    const bc = active ? p.color : theme.border;
                    const bg = active ? p.color : theme.light ? '#e2e8f0' : 'rgba(30,41,59,0.7)';
                    return (
                      <div key={p.id} className="flex items-center">
                        <button
                          onClick={() => handlePersonaChange(p)}
                          title={`${p.name} · ${p.role} · Custom`}
                          className="flex items-center gap-1 px-2 py-1 rounded-l-lg text-[11px] font-semibold transition-all duration-150"
                          style={{ background: bg, color: active ? 'white' : tm, borderTop: `1px solid ${bc}`, borderBottom: `1px solid ${bc}`, borderLeft: `1px solid ${bc}`, borderRight: 'none' }}
                        >
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-white font-black text-[9px] flex-shrink-0" style={{ background: active ? 'rgba(255,255,255,0.25)' : p.color }}>{p.avatar}</span>
                          {p.name}
                          <span className="text-[8px] opacity-70 ml-0.5">✦</span>
                        </button>
                        <button onClick={() => handleEditPersona(p)} title="Edit persona" className="px-1.5 py-1 text-[10px] transition-all hover:opacity-80" style={{ background: bg, color: active ? 'rgba(255,255,255,0.8)' : tm, borderTop: `1px solid ${bc}`, borderBottom: `1px solid ${bc}`, borderLeft: `1px solid ${active ? 'rgba(255,255,255,0.15)' : theme.border}`, borderRight: 'none' }}>✏</button>
                        <button onClick={() => handleDeletePersona(p.id)} title="Delete persona" className="px-1.5 py-1 text-[10px] rounded-r-lg transition-all hover:opacity-80" style={{ background: bg, color: active ? 'rgba(255,255,255,0.8)' : '#ef4444', borderTop: `1px solid ${bc}`, borderBottom: `1px solid ${bc}`, borderLeft: `1px solid ${active ? 'rgba(255,255,255,0.15)' : theme.border}`, borderRight: `1px solid ${bc}` }}>×</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <button
              onClick={openNewBuilder}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:scale-105"
              style={{ background: theme.light ? '#e2e8f0' : 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.4)' }}
            >
              + Build
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            {/* View mode toggle */}
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: theme.bgAlt, border: `1px solid ${theme.border}` }}>
              {([['mobile', '📱 Mobile'], ['web', '🖥 Web']] as [ViewMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all"
                  style={{ background: viewMode === mode ? selectedPersona.color : 'transparent', color: viewMode === mode ? 'white' : tm }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* CDH API panel toggle */}
            <button
              onClick={() => setShowCDHPanel((v) => !v)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
              style={{ background: showCDHPanel ? `${selectedPersona.color}20` : theme.bgAlt, color: showCDHPanel ? selectedPersona.color : tm, border: `1px solid ${showCDHPanel ? selectedPersona.color + '60' : theme.border}` }}
            >
              ⚡ CDH API
            </button>

            {/* Theme swatches */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-medium mr-0.5" style={{ color: ts }}>Theme</span>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  title={t.name}
                  className="transition-all duration-150"
                  style={{ width: 14, height: 14, borderRadius: '50%', background: t.swatch, border: themeId === t.id ? `2px solid ${selectedPersona.color}` : `2px solid ${theme.border}`, boxShadow: themeId === t.id ? `0 0 0 1px ${selectedPersona.color}` : 'none', transform: themeId === t.id ? 'scale(1.25)' : 'scale(1)' }}
                />
              ))}
            </div>

            <div className="text-[10px] font-semibold px-2.5 py-1 rounded-full hidden lg:block" style={{ background: `${selectedPersona.color}20`, color: selectedPersona.color, border: `1px solid ${selectedPersona.color}30` }}>
              CDH Real-Time Container
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: tm }}>
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: cdhConfig.enabled ? (cdhLive.liveActions ? '#22c55e' : cdhLive.error ? '#ef4444' : '#f59e0b') : '#22c55e' }}
              />
              {cdhConfig.enabled
                ? cdhLive.loading ? 'CDH Calling…'
                  : cdhLive.liveActions ? 'CDH Live ⚡'
                  : cdhLive.error ? 'CDH Error'
                  : 'CDH Live ⚡'
                : 'CDH Mock'}
            </div>
          </div>
        </div>
      </header>

      {/* ── Stage navigation (phase selector + stage tabs + contextual social strip) ── */}
      <div style={{ borderBottom: `1px solid ${theme.border}`, background: `${theme.bg}ee` }}>
        {/* Phase row */}
        <div className="max-w-screen-xl mx-auto px-5 flex items-center gap-1 pt-2">
          {PHASE_GROUPS.map((pg) => {
            const active = selectedPhase === pg.phaseNum;
            return (
              <button
                key={pg.phaseNum}
                onClick={() => handlePhaseChange(pg.phaseNum)}
                className="flex flex-col items-center px-3 py-1.5 rounded-t-lg text-[10px] font-bold transition-all duration-150 border border-b-0"
                style={{ background: active ? `${selectedPersona.color}18` : 'transparent', borderColor: active ? `${selectedPersona.color}40` : 'transparent', color: active ? selectedPersona.color : tm }}
              >
                <span>{pg.label}</span>
                <span className="text-[8px] font-normal opacity-70">{pg.sub}</span>
              </button>
            );
          })}
          <div className="ml-auto text-[9px] font-mono truncate max-w-xs" style={{ color: ts }}>{stage.containerName}</div>
        </div>

        {/* Stage row */}
        <div className="max-w-screen-xl mx-auto px-5 flex items-center">
          {(PHASE_GROUPS.find((g) => g.phaseNum === selectedPhase)?.stages ?? []).map((sid) => {
            const stageData = stages.find((s) => s.id === sid);
            if (!stageData) return null;
            const active = selectedStage === sid;
            return (
              <button
                key={sid}
                onClick={() => handleStageChange(sid)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150"
                style={{ borderColor: active ? selectedPersona.color : 'transparent', color: active ? tx : tm, background: active ? `${selectedPersona.color}08` : 'transparent' }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
                  style={{ background: active ? selectedPersona.color : theme.bgAlt, color: active ? 'white' : tm, border: `1px solid ${theme.border}` }}
                >
                  {sid}
                </span>
                <span className="hidden sm:inline">{stageData.shortName}</span>
              </button>
            );
          })}
        </div>

        {/* Social platform strip — contextual, only when Stage 1 is active */}
        {selectedStage === 1 && (
          <div className="slide-in" style={{ borderTop: `1px solid ${theme.border}`, background: theme.light ? '#e8eef5' : 'rgba(255,255,255,0.04)' }}>
            <div className="max-w-screen-xl mx-auto px-5 py-2 flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest flex-shrink-0" style={{ color: activePlatform.color }}>
                {activePlatform.icon} Social Channel
              </span>
              <div className="flex items-center gap-1.5">
                {platforms.map((p) => {
                  const active = activePlatform.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePlatformChange(p)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-150"
                      style={{ background: active ? p.color : theme.light ? '#e2e8f0' : 'rgba(255,255,255,0.07)', color: active ? 'white' : theme.light ? '#475569' : '#94a3b8', border: `1px solid ${active ? p.color : theme.border}`, boxShadow: active ? `0 0 10px ${p.color}66` : 'none', transform: active ? 'scale(1.05)' : 'scale(1)' }}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="ml-auto flex items-center gap-2 text-[9px] font-mono" style={{ color: ts }}>
                <span className="px-2 py-0.5 rounded" style={{ background: `${activePlatform.color}20`, color: activePlatform.color, border: `1px solid ${activePlatform.color}40` }}>{activePlatform.adFormat}</span>
                <span>{activePlatform.channelCode}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Capture notification banner ── */}
      {captured && captureResponse && (
        <div className="border-b slide-in" style={{ background: `${selectedPersona.color}15`, borderColor: `${selectedPersona.color}30` }}>
          <div className="max-w-screen-xl mx-auto px-5 py-2 flex items-center gap-3">
            <span className="text-green-400 font-bold text-xs">📡 Interaction captured</span>
            <span className="text-slate-400 text-xs">{captureResponse.InteractionID}</span>
            <span className="text-slate-500 text-[10px]">·</span>
            <span className="text-slate-400 text-xs">
              Next NBA: <span className="font-semibold" style={{ color: selectedPersona.color }}>{captureResponse.NextBestAction.ActionName}</span>
            </span>
            <span className="text-slate-500 text-[10px]">·</span>
            <span className="text-slate-400 text-xs">Δ propensity +{(captureResponse.PropensityDelta * 100).toFixed(0)}pp</span>
            <span className="ml-auto text-[10px] text-slate-600 font-mono">{captureResponse.ATRSRef}</span>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="flex-1 max-w-screen-xl mx-auto w-full px-5 py-5" style={{ color: tx }}>
        <div
          className="grid gap-5 items-start"
          style={{ gridTemplateColumns: showCDHPanel ? '260px 1fr 330px' : '260px 1fr' }}
        >

          {/* Left: Candidate profile + signals */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: ts }}>
              Candidate Profile · Signal Feed
            </div>
            <CandidateProfile
              key={`profile-${selectedPersona.id}-${stage.id}`}
              stage={effectiveStage}
              persona={selectedPersona}
            />
          </div>

          {/* Centre: flow + views */}
          <div className="flex flex-col gap-4">
            {/* 3-node flow header — labels derived from useStageView */}
            <div className="w-full grid grid-cols-3 gap-1 text-[10px] font-mono">
              {[
                {
                  label: stageView.touchpointLabel,
                  sub: stageView.touchpointSub,
                  color: stageView.touchpointColor,
                },
                { label: '→ CDH API →', sub: 'Real-Time Container', color: '#006dcc' },
                {
                  label: captured ? '✓ Captured' : nbaReady ? 'NBA Rendered' : 'Awaiting…',
                  sub: captured ? 'POST /interactions/capture' : nbaReady ? stage.actions[0]?.Channel ?? '' : 'CDH deciding',
                  color: captured ? '#22c55e' : nbaReady ? '#22c55e' : '#334155',
                },
              ].map(({ label, sub, color }, i) => (
                <div key={i} className="text-center px-2 py-1.5 rounded-lg" style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
                  <div className="font-bold truncate" style={{ color }}>{label}</div>
                  <div className="text-slate-600 text-[9px] truncate">{sub}</div>
                </div>
              ))}
            </div>

            {/* View area — mobile / web */}
            <div className="flex justify-center">
              {viewMode === 'mobile' && (
                <SimpleMobile
                  key={`mobile-${selectedPersona.id}-${stage.id}-${activePlatform.id}`}
                  stage={effectiveStage}
                  persona={selectedPersona}
                  nbaReady={nbaReady}
                  platform={activePlatform}
                  capturing={capturing}
                  captured={captured}
                  onCtaClick={handleCtaClick}
                />
              )}
              {viewMode === 'web' && (
                <div className="w-full">
                  <WebPortal
                    key={`web-${selectedPersona.id}-${stage.id}-${activePlatform.id}`}
                    stage={effectiveStage}
                    persona={selectedPersona}
                    nbaReady={nbaReady}
                    platform={activePlatform}
                    capturing={capturing}
                    captured={captured}
                    onCtaClick={handleCtaClick}
                  />
                </div>
              )}
            </div>

            {/* Candidate sees */}
            <div
              className="w-full rounded-xl p-3 text-xs text-slate-300 leading-relaxed"
              style={{ background: `${selectedPersona.color}0a`, border: `1px solid ${selectedPersona.color}20` }}
            >
              <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: selectedPersona.color }}>
                Candidate sees · {stage.dayRange}
              </div>
              {stage.candidateSees}
            </div>
          </div>

          {/* Right: CDH API panel — shown on demand via ⚡ CDH API toggle */}
          {showCDHPanel && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-2" style={{ color: ts }}>
                CDH Real-Time Container · API
                {cdhConfig.enabled && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: cdhLive.liveActions ? '#22c55e20' : '#f59e0b20', color: cdhLive.liveActions ? '#22c55e' : '#f59e0b', border: `1px solid ${cdhLive.liveActions ? '#22c55e40' : '#f59e0b40'}` }}>
                    <span className={`w-1 h-1 rounded-full ${cdhLive.liveActions ? 'bg-green-400' : 'bg-amber-400'} animate-pulse`} />
                    {cdhLive.loading ? 'CALLING…' : cdhLive.liveActions ? 'LIVE' : cdhLive.error ? 'ERROR' : 'LIVE'}
                  </span>
                )}
              </div>
              <CDHApiPanel
                key={`api-${apiKey}`}
                stage={effectiveStage}
                persona={selectedPersona}
                onNBAReady={handleNBAReady}
                captureRequest={captureRequest}
                captureResponse={captureResponse}
                capturing={capturing}
                config={cdhConfig}
                onConfigChange={updateCDHConfig}
                onConfigReset={resetCDHConfig}
                liveState={cdhLive}
                onManualCall={cdhLive.callCDH}
                buildRequestBody={cdhLive.buildRequestBody}
              />
            </div>
          )}
        </div>

        {/* ── Architecture flow bar ── */}
        <div className="mt-5 rounded-2xl p-4" style={{ background: theme.bgAlt, border: `1px solid ${theme.border}` }}>
          <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: ts }}>
            Integration Architecture · Stage {stage.id}: {stage.name}
            {captured && <span className="ml-2 text-green-400">· Capture recorded ✓</span>}
          </div>
          <div className="flex items-stretch gap-2 overflow-x-auto">
            {[
              // Source node — platform or candidate depending on stage, via stageView
              {
                label:  stageView.archSourceLabel,
                detail: stageView.archSourceDetail,
                sub:    stageView.archSourceSub,
                color:  stageView.archSourceColor,
                icon:   stageView.archSourceIcon,
              },
              { label: 'CDH Adaptive Model',  detail: `${stage.propensity}% → ${stage.adaptiveScore}%`,  sub: 'Engagement policy · D&I fairness · arbitration',  color: '#006dcc', icon: '🧠' },
              { label: 'Real-Time Container',  detail: 'POST /real-time-container',                       sub: stage.containerName,                                color: '#00c2ff', icon: '⚡' },
              { label: 'NBA Arbitration',      detail: `${stage.actions.length} actions ranked`,          sub: `Winner: ${stage.actions[0]?.ActionID ?? '–'}`,     color: '#22c55e', icon: '🎯' },
              ...(captured ? [{
                label: 'Capture API', detail: 'Interaction recorded',
                sub: captureResponse?.InteractionID?.slice(0, 24) ?? '–', color: '#f59e0b', icon: '📡',
              }] : []),
              ...(captured && captureResponse ? [{
                label: 'Next NBA Queued',
                detail: captureResponse.NextBestAction.ActionName.split(' ').slice(0, 4).join(' ') + '…',
                sub: `pAccept ${(captureResponse.NextBestAction.pAccept * 100).toFixed(0)}% · ${captureResponse.NextBestAction.Channel}`,
                color: selectedPersona.color, icon: '➡',
              }] : []),
              // Pattern node when not yet captured — resolved from derived patternArchNode
              ...(!captured ? [patternArchNode] : []),
            ].map(({ label, detail, sub, color, icon }, i, arr) => (
              <div key={label} className="flex items-center gap-1.5 flex-shrink-0">
                <div className="rounded-xl p-2.5 w-36" style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[9px] font-bold text-white leading-tight">{label}</span>
                  </div>
                  <div className="text-[10px] font-semibold truncate" style={{ color }}>{detail}</div>
                  <div className="text-[9px] text-slate-600 leading-snug mt-0.5 line-clamp-2">{sub}</div>
                </div>
                {i < arr.length - 1 && <div className="text-slate-700 text-sm flex-shrink-0">→</div>}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] font-mono" style={{ color: ts }}>
            ATRS-recorded · D&I 0.91 ≥ 0.85 · CDH Real-Time Container
          </div>
        </div>
      </div>

      {/* Persona Builder modal */}
      <PersonaBuilder
        isOpen={builderOpen}
        onClose={() => { setBuilderOpen(false); setEditPersona(null); }}
        onApply={handlePersonaSaved}
        editPersona={editPersona}
        theme={theme}
      />
    </div>
  );
}
