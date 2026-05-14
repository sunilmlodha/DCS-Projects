import { useEffect, useState } from 'react';
import type { StageConfig } from '../data/cdh';
import type { Persona } from '../data/types';

interface Props {
  stage: StageConfig;
  persona: Persona;
}

const serviceLabel: Record<string, string> = {
  army: 'British Army',
  navy: 'Royal Navy',
  raf: 'Royal Air Force',
};

const serviceIcon: Record<string, string> = {
  army: '⚔️',
  navy: '⚓',
  raf: '✈️',
};

function CollapsibleSection({
  title, badge, defaultOpen = false, children,
}: {
  title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{title}</span>
          {badge && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{badge}</span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="bg-white px-3 py-3">{children}</div>}
    </div>
  );
}

export default function CandidateProfile({ stage, persona }: Props) {
  const [visibleSignals, setVisibleSignals] = useState(0);

  useEffect(() => {
    setVisibleSignals(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setVisibleSignals(i);
      if (i >= stage.signals.length) clearInterval(t);
    }, 280);
    return () => clearInterval(t);
  }, [stage.id, persona.id]);

  return (
    <div className="flex flex-col gap-2.5">

      {/* Profile card */}
      <div
        className="rounded-2xl p-4"
        style={{ background: `linear-gradient(135deg, ${persona.color}18, ${persona.color}08)`, border: `1px solid ${persona.color}30` }}
      >
        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0 shadow-sm"
            style={{ background: persona.color }}
          >
            {persona.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-base leading-tight" style={{ color: persona.color }}>{persona.name}</div>
            <div className="text-slate-600 text-xs mt-0.5">{serviceIcon[persona.service]} {serviceLabel[persona.service]}</div>
          </div>
        </div>

        {/* Personal details grid */}
        <div className="space-y-1.5 mb-3">
          {[
            { label: 'Role', value: persona.role },
            { label: 'Age', value: `${persona.age} years old` },
            { label: 'Location', value: persona.location },
            { label: 'Background', value: persona.background },
            ...(persona.builderCohort ? [{ label: 'Cohort', value: persona.builderCohort }] : []),
            ...(persona.builderEducation ? [{ label: 'Education', value: persona.builderEducation }] : []),
            { label: 'Target', value: `Day ${persona.targetDay} · ${persona.targetMilestone}` },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-2 text-[11px]">
              <span className="text-slate-400 flex-shrink-0 w-20">{label}</span>
              <span className="text-slate-700 font-medium leading-snug">{value}</span>
            </div>
          ))}
        </div>

        {/* Propensity scores */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2 text-center" style={{ background: `${persona.color}12` }}>
            <div className="text-slate-500 text-[9px] uppercase tracking-wide mb-0.5">Propensity</div>
            <div className="font-black text-lg leading-none" style={{ color: persona.color }}>{stage.propensity}%</div>
            <div className="text-[9px] text-slate-400 mt-0.5">{persona.propensityStart}% → {persona.propensityEnd}%</div>
          </div>
          <div className="rounded-lg p-2 text-center bg-cyan-50">
            <div className="text-slate-500 text-[9px] uppercase tracking-wide mb-0.5">Adaptive Score</div>
            <div className="font-black text-lg leading-none text-cyan-600">{stage.adaptiveScore}%</div>
            <div className="text-[9px] text-slate-400 mt-0.5">CDH model</div>
          </div>
        </div>

        {/* Case ID */}
        <div className="mt-2.5 text-[9px] font-mono text-slate-400 text-center">{persona.caseId}</div>
      </div>

      {/* Live Signal Feed — collapsed by default */}
      <CollapsibleSection title="Signal Feed" badge={`${stage.signals.length} received`}>
        <div className="font-mono text-[10px] space-y-1.5 max-h-52 overflow-y-auto">
          {stage.signals.map((sig, i) => (
            <div
              key={i}
              className="flex gap-2 transition-all duration-300"
              style={{ opacity: i < visibleSignals ? 1 : 0, transform: i < visibleSignals ? 'translateY(0)' : 'translateY(4px)' }}
            >
              <span className="text-slate-400 flex-shrink-0">{sig.timestamp}</span>
              <span className="text-cyan-600 flex-shrink-0 truncate max-w-[90px]">{sig.signal}</span>
              <span className="text-amber-600 truncate">"{sig.value}"</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Engagement Policy Gate — collapsed by default */}
      <CollapsibleSection title="Policy Gate" badge="All PASS">
        <div className="space-y-1.5">
          {[
            { label: 'Eligible', val: '✓ Yes' },
            { label: 'Consented', val: '✓ Yes' },
            { label: 'Fatigue check', val: 'PASS' },
            { label: 'Disparity ratio', val: '0.91 ≥ 0.85' },
            { label: 'ATRS audit', val: 'Recorded' },
          ].map(({ label, val }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">{label}</span>
              <span className="text-green-600 text-[11px] font-semibold">{val}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

    </div>
  );
}
