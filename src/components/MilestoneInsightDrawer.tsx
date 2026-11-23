import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MapPin,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MilestoneHistoryPoint {
  period: string;
  cumulative: number;
  quarterlyDelta: number;
}

export interface MilestoneRegionalShare {
  corridor: string;
  hubs: string;
  valueLabel: string;
  sharePct: number;
}

export interface MilestoneRegionalReport {
  id: string;
  title: string;
  region: string;
  published: string;
  summary: string;
  actionTarget: 'centres' | 'optimizer' | 'knowledge' | 'pickup';
  actionLabel: string;
}

export interface MilestoneItem {
  id: string;
  icon: LucideIcon;
  metric: string;
  title: string;
  period: string;
  description: string;
  liveFootnote: string;
  liveDetailLabel: string;
  liveDetailValue: string;
  unitLabel: string;
  yoyGrowthLabel: string;
  peakQuarterLabel: string;
  methodologyNote: string;
  history: MilestoneHistoryPoint[];
  regions: MilestoneRegionalShare[];
  reports: MilestoneRegionalReport[];
}

interface MilestoneInsightDrawerProps {
  milestone: MilestoneItem | null;
  allMilestones: MilestoneItem[];
  onSelectMilestone: (milestone: MilestoneItem) => void;
  onClose: () => void;
  onActionNavigate?: (target: 'centres' | 'optimizer' | 'knowledge' | 'pickup') => void;
}

export const MilestoneInsightDrawer: React.FC<MilestoneInsightDrawerProps> = ({
  milestone,
  allMilestones,
  onSelectMilestone,
  onClose,
  onActionNavigate,
}) => {
  const [downloadedReportId, setDownloadedReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!milestone) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [milestone, onClose]);

  useEffect(() => {
    setDownloadedReportId(null);
  }, [milestone?.id]);

  const currentIdx = milestone
    ? allMilestones.findIndex((m) => m.id === milestone.id)
    : -1;

  const handlePrev = () => {
    if (currentIdx < 0 || allMilestones.length === 0) return;
    const prevIndex = (currentIdx - 1 + allMilestones.length) % allMilestones.length;
    onSelectMilestone(allMilestones[prevIndex]);
  };

  const handleNext = () => {
    if (currentIdx < 0 || allMilestones.length === 0) return;
    const nextIndex = (currentIdx + 1) % allMilestones.length;
    onSelectMilestone(allMilestones[nextIndex]);
  };

  const handleDownloadReportCsv = (report: MilestoneRegionalReport) => {
    if (!milestone) return;
    const lines: string[] = [
      `"Reboot Earth Milestone Regional Brief"`,
      `"Milestone","${milestone.metric} - ${milestone.title}"`,
      `"Report Title","${report.title}"`,
      `"Region","${report.region}"`,
      `"Published","${report.published}"`,
      `"Live Workspace Ledger","${milestone.liveDetailLabel}: ${milestone.liveDetailValue}"`,
      '',
      `"Quarterly Progression (${milestone.unitLabel})"`,
      `"Quarter","Cumulative (${milestone.unitLabel})","Quarterly Addition (${milestone.unitLabel})"`,
      ...milestone.history.map(
        (h) => `"${h.period}",${h.cumulative},${h.quarterlyDelta}`
      ),
      '',
      `"Regional Corridor Breakdown"`,
      `"Corridor","Primary Hubs","Contribution","Share (%)"`,
      ...milestone.regions.map(
        (r) => `"${r.corridor}","${r.hubs}","${r.valueLabel}",${r.sharePct}`
      ),
      '',
      `"Disclosure","${milestone.methodologyNote.replace(/"/g, '""')}"`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reboot-earth-${milestone.id}-${report.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloadedReportId(report.id);
  };

  const handleActionClick = (target: MilestoneRegionalReport['actionTarget']) => {
    onClose();
    onActionNavigate?.(target);
  };

  return (
    <AnimatePresence>
      {milestone && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="milestone-drawer-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          {/* Slide-Over Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="relative z-10 w-full max-w-xl h-full bg-[#F4F9FF] dark:bg-[#061526] border-l border-sky-200/90 dark:border-sky-800/80 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Top Gradient Hairline */}
            <div
              aria-hidden="true"
              className="h-1 w-full bg-gradient-to-r from-sky-500 via-cyan-400 to-sky-600 shrink-0"
            />

            {/* Sticky Header */}
            <div className="px-6 py-5 border-b border-sky-200/80 dark:border-sky-900/70 bg-white/90 dark:bg-[#0B223B]/95 backdrop-blur-md flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/60 border border-sky-200/80 dark:border-sky-800 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
                  <milestone.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">
                    {milestone.period}
                  </p>
                  <h3
                    id="milestone-drawer-title"
                    className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-sky-50 leading-tight mt-0.5"
                  >
                    {milestone.metric} · {milestone.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close milestone insights drawer"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-sky-200/75 dark:hover:text-white hover:bg-sky-100/70 dark:hover:bg-sky-900/50 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Executive Overview + Live Ledger Sync */}
              <div className="space-y-4">
                <p className="text-sm text-slate-700 dark:text-sky-100/85 leading-relaxed">
                  {milestone.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-white dark:bg-[#0B223B]">
                    <span className="block text-[11px] text-slate-500 dark:text-sky-200/65">
                      {milestone.liveDetailLabel}
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-sky-700 dark:text-sky-300 mt-1">
                      {milestone.liveDetailValue}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-white dark:bg-[#0B223B]">
                    <span className="block text-[11px] text-slate-500 dark:text-sky-200/65">
                      Year-over-Year Velocity
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-sky-50 mt-1">
                      <TrendingUp className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      {milestone.yoyGrowthLabel}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-white dark:bg-[#0B223B]">
                    <span className="block text-[11px] text-slate-500 dark:text-sky-200/65">
                      Peak Quarter
                    </span>
                    <span className="block font-mono tabular-nums text-base font-bold text-slate-900 dark:text-sky-50 mt-1">
                      {milestone.peakQuarterLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Historical Growth Chart */}
              <div className="p-5 rounded-2xl border border-sky-200/85 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                      Historical Growth Trajectory
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-sky-200/65">
                      Six-quarter cumulative ramp ({milestone.unitLabel})
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                    {milestone.history[0]?.period} – {milestone.history[milestone.history.length - 1]?.period}
                  </span>
                </div>

                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={milestone.history}
                      margin={{ top: 8, right: 12, left: -6, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id={`milestoneGrad-${milestone.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.34} />
                          <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.16)" />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={{ stroke: 'rgba(148, 163, 184, 0.35)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val: number) =>
                          val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : String(val)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#081C32',
                          borderColor: '#0369A1',
                          color: '#E0F2FE',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                        formatter={(value: unknown, name: unknown) => [
                          `${Number(value).toLocaleString()} ${milestone.unitLabel}`,
                          name === 'cumulative' ? 'Cumulative Total' : 'Quarter Addition',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="#0284C7"
                        strokeWidth={2.5}
                        fill={`url(#milestoneGrad-${milestone.id})`}
                        activeDot={{ r: 5, fill: '#38BDF8', stroke: '#FFFFFF', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Regional Corridor Contributions */}
              <div className="p-5 rounded-2xl border border-sky-200/85 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                      Regional Corridor Breakdown
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-sky-200/65">
                    Coalition Share
                  </span>
                </div>

                <div className="space-y-3.5">
                  {milestone.regions.map((reg) => (
                    <div key={reg.corridor} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800 dark:text-sky-100">
                            {reg.corridor}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-sky-200/60 truncate">
                            {reg.hubs}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-700 dark:text-sky-200 whitespace-nowrap shrink-0">
                          <strong className="text-sky-700 dark:text-sky-300">{reg.valueLabel}</strong> ({reg.sharePct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-sky-100 dark:bg-[#061526] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-400 transition-all duration-500"
                          style={{ width: `${Math.max(6, reg.sharePct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Regional Reports & Deep Links */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                    Regional Reports &amp; Operational Links
                  </h4>
                </div>

                <div className="space-y-3">
                  {milestone.reports.map((report) => {
                    const isDownloaded = downloadedReportId === report.id;
                    return (
                      <div
                        key={report.id}
                        className="p-4 rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                              {report.title}
                            </p>
                            <p className="text-[11px] font-mono text-sky-700 dark:text-sky-400">
                              {report.region} · {report.published}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                          {report.summary}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadReportCsv(report)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-300 dark:border-sky-800 bg-sky-50/70 dark:bg-[#061526] text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {isDownloaded ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                                CSV Downloaded
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                Download Regional CSV
                              </>
                            )}
                          </button>

                          {onActionNavigate && (
                            <button
                              type="button"
                              onClick={() => handleActionClick(report.actionTarget)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              {report.actionLabel}
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compliance / Methodology Disclosure */}
              <div className="p-4 rounded-xl border border-sky-200/75 dark:border-sky-900/60 bg-sky-50/70 dark:bg-[#091C32] flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-sky-200/75 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <p>{milestone.methodologyNote}</p>
              </div>
            </div>

            {/* Sticky Footer Stepper */}
            <div className="px-6 py-3.5 border-t border-sky-200/80 dark:border-sky-900/70 bg-white/95 dark:bg-[#0B223B]/95 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-sky-100 hover:bg-sky-100/70 dark:hover:bg-sky-900/50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-200/65">
                Milestone {currentIdx + 1} of {allMilestones.length}
              </span>

              <button
                type="button"
                onClick={handleNext}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-sky-100 hover:bg-sky-100/70 dark:hover:bg-sky-900/50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
