import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TrendingUp } from 'lucide-react';
import type { MonthlyImpactTrendPoint } from '../types';

interface ImpactTrendChartProps {
  data: MonthlyImpactTrendPoint[];
}

export const ImpactTrendChart: React.FC<ImpactTrendChartProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [containerWidth, setContainerWidth] = useState(720);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const [showCollection, setShowCollection] = useState(true);
  const [showEnergy, setShowEnergy] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Observe container width for responsive D3 redraws
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setContainerWidth(Math.floor(rect.width));
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Observe light/dark theme class changes on <html>
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const summary = useMemo(() => {
    if (data.length < 2) {
      return { collectionGrowthPct: 0, energyGrowthPct: 0 };
    }
    const first = data[0];
    const last = data[data.length - 1];
    const collectionGrowthPct =
      first.collectedKg > 0
        ? Math.round(((last.collectedKg - first.collectedKg) / first.collectedKg) * 100)
        : 0;
    const energyGrowthPct =
      first.energyRecoveredKwh > 0
        ? Math.round(((last.energyRecoveredKwh - first.energyRecoveredKwh) / first.energyRecoveredKwh) * 100)
        : 0;
    return { collectionGrowthPct, energyGrowthPct };
  }, [data]);

  const chartHeight = 290;
  const margin = useMemo(
    () => ({
      top: 20,
      right: containerWidth < 520 ? 50 : 66,
      bottom: 36,
      left: containerWidth < 520 ? 46 : 58,
    }),
    [containerWidth]
  );

  // Render D3 dual-axis line & area chart
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || data.length === 0) return;

    const width = Math.max(280, containerWidth);
    const innerWidth = Math.max(120, width - margin.left - margin.right);
    const innerHeight = chartHeight - margin.top - margin.bottom;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${chartHeight}`);

    const collectionStroke = isDark ? '#38BDF8' : '#0284C7';
    const energyStroke = isDark ? '#818CF8' : '#4F46E5';
    const gridColor = isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(14, 165, 233, 0.16)';
    const axisTextColor = isDark ? '#94C5EB' : '#475569';
    const dotBg = isDark ? '#0B223B' : '#FFFFFF';

    // Gradients for soft area washes
    const defs = svg.append('defs');

    const colGrad = defs
      .append('linearGradient')
      .attr('id', 'impact-collection-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    colGrad.append('stop').attr('offset', '0%').attr('stop-color', collectionStroke).attr('stop-opacity', isDark ? 0.28 : 0.2);
    colGrad.append('stop').attr('offset', '100%').attr('stop-color', collectionStroke).attr('stop-opacity', 0.01);

    const engGrad = defs
      .append('linearGradient')
      .attr('id', 'impact-energy-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    engGrad.append('stop').attr('offset', '0%').attr('stop-color', energyStroke).attr('stop-opacity', isDark ? 0.22 : 0.14);
    engGrad.append('stop').attr('offset', '100%').attr('stop-color', energyStroke).attr('stop-opacity', 0.01);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scalePoint<string>()
      .domain(data.map((d) => d.label))
      .range([0, innerWidth])
      .padding(0.18);

    const maxKg = Math.max(100, d3.max(data, (d) => d.collectedKg) || 100);
    const maxKwh = Math.max(500, d3.max(data, (d) => d.energyRecoveredKwh) || 500);

    const yLeft = d3.scaleLinear().domain([0, maxKg * 1.18]).nice().range([innerHeight, 0]);
    const yRight = d3.scaleLinear().domain([0, maxKwh * 1.18]).nice().range([innerHeight, 0]);

    // Horizontal grid lines anchored to left axis
    g.append('g')
      .attr('class', 'grid-lines')
      .call(
        d3
          .axisLeft(yLeft)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .call((sel) =>
        sel
          .selectAll('line')
          .attr('stroke', gridColor)
          .attr('stroke-dasharray', '3,3')
      );

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0))
      .call((sel) => sel.select('.domain').attr('stroke', gridColor))
      .call((sel) => sel.selectAll('line').attr('stroke', gridColor))
      .call((sel) =>
        sel
          .selectAll('text')
          .attr('fill', axisTextColor)
          .attr('font-size', '11px')
          .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
          .attr('dy', '1.15em')
      );

    // Left Y Axis (E-Waste kg)
    if (showCollection) {
      g.append('g')
        .call(
          d3
            .axisLeft(yLeft)
            .ticks(5)
            .tickFormat((v) => `${Number(v).toLocaleString()}`)
        )
        .call((sel) => sel.select('.domain').remove())
        .call((sel) => sel.selectAll('line').remove())
        .call((sel) =>
          sel
            .selectAll('text')
            .attr('fill', collectionStroke)
            .attr('font-size', '11px')
            .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
        );

      g.append('text')
        .attr('x', -margin.left + 4)
        .attr('y', -7)
        .attr('fill', collectionStroke)
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text('kg');
    }

    // Right Y Axis (Energy kWh)
    if (showEnergy) {
      g.append('g')
        .attr('transform', `translate(${innerWidth},0)`)
        .call(
          d3
            .axisRight(yRight)
            .ticks(5)
            .tickFormat((v) => {
              const num = Number(v);
              return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : `${num}`;
            })
        )
        .call((sel) => sel.select('.domain').remove())
        .call((sel) => sel.selectAll('line').remove())
        .call((sel) =>
          sel
            .selectAll('text')
            .attr('fill', energyStroke)
            .attr('font-size', '11px')
            .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
        );

      g.append('text')
        .attr('x', innerWidth + margin.right - 6)
        .attr('y', -7)
        .attr('text-anchor', 'end')
        .attr('fill', energyStroke)
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text('kWh');
    }

    // Series 1: E-Waste Collected Area + Line
    if (showCollection) {
      const colArea = d3
        .area<MonthlyImpactTrendPoint>()
        .x((d) => xScale(d.label) ?? 0)
        .y0(innerHeight)
        .y1((d) => yLeft(d.collectedKg))
        .curve(d3.curveMonotoneX);

      const colLine = d3
        .line<MonthlyImpactTrendPoint>()
        .x((d) => xScale(d.label) ?? 0)
        .y((d) => yLeft(d.collectedKg))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(data).attr('fill', 'url(#impact-collection-grad)').attr('d', colArea);

      const colPath = g
        .append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', collectionStroke)
        .attr('stroke-width', 2.75)
        .attr('stroke-linecap', 'round')
        .attr('d', colLine);

      if (!prefersReducedMotion) {
        const len = colPath.node()?.getTotalLength() || 0;
        colPath
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .transition()
          .duration(650)
          .ease(d3.easeCubicOut)
          .attr('stroke-dashoffset', 0);
      }
    }

    // Series 2: Energy Recovered Area + Line
    if (showEnergy) {
      const engArea = d3
        .area<MonthlyImpactTrendPoint>()
        .x((d) => xScale(d.label) ?? 0)
        .y0(innerHeight)
        .y1((d) => yRight(d.energyRecoveredKwh))
        .curve(d3.curveMonotoneX);

      const engLine = d3
        .line<MonthlyImpactTrendPoint>()
        .x((d) => xScale(d.label) ?? 0)
        .y((d) => yRight(d.energyRecoveredKwh))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(data).attr('fill', 'url(#impact-energy-grad)').attr('d', engArea);

      const engPath = g
        .append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', energyStroke)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6,4')
        .attr('stroke-linecap', 'round')
        .attr('d', engLine);

      if (!prefersReducedMotion) {
        engPath.attr('opacity', 0).transition().duration(550).ease(d3.easeCubicOut).attr('opacity', 1);
      }
    }

    // Vertical hover guide line
    const guideLine = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', isDark ? 'rgba(186, 230, 253, 0.35)' : 'rgba(2, 132, 199, 0.3)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    // Data point dots
    const colDots = showCollection
      ? g
          .selectAll('.col-dot')
          .data(data)
          .enter()
          .append('circle')
          .attr('cx', (d) => xScale(d.label) ?? 0)
          .attr('cy', (d) => yLeft(d.collectedKg))
          .attr('r', 4)
          .attr('fill', dotBg)
          .attr('stroke', collectionStroke)
          .attr('stroke-width', 2.25)
      : null;

    const engDots = showEnergy
      ? g
          .selectAll('.eng-dot')
          .data(data)
          .enter()
          .append('circle')
          .attr('cx', (d) => xScale(d.label) ?? 0)
          .attr('cy', (d) => yRight(d.energyRecoveredKwh))
          .attr('r', 4)
          .attr('fill', dotBg)
          .attr('stroke', energyStroke)
          .attr('stroke-width', 2.25)
      : null;

    // Interactive invisible hit bands per month
    const xPositions = data.map((d) => xScale(d.label) ?? 0);

    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < xPositions.length; i++) {
          const dist = Math.abs(mx - xPositions[i]);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
        setHoveredIdx(nearestIdx);
        guideLine.attr('x1', xPositions[nearestIdx]).attr('x2', xPositions[nearestIdx]).style('opacity', 1);
        colDots?.attr('r', (_d, i) => (i === nearestIdx ? 6 : 4));
        engDots?.attr('r', (_d, i) => (i === nearestIdx ? 6 : 4));
      })
      .on('mouseleave', () => {
        setHoveredIdx(null);
        guideLine.style('opacity', 0);
        colDots?.attr('r', 4);
        engDots?.attr('r', 4);
      });
  }, [data, containerWidth, isDark, showCollection, showEnergy, margin]);

  const hoveredPoint = hoveredIdx !== null ? data[hoveredIdx] : null;
  const prevPoint = hoveredIdx !== null && hoveredIdx > 0 ? data[hoveredIdx - 1] : null;

  const tooltipLeftPct = useMemo(() => {
    if (hoveredIdx === null || data.length <= 1) return 50;
    const raw = (hoveredIdx / (data.length - 1)) * 100;
    return Math.min(82, Math.max(18, raw));
  }, [hoveredIdx, data.length]);

  return (
    <div className="rounded-2xl border border-sky-200/80 dark:border-sky-900/70 bg-white/95 dark:bg-[#0B223B] p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              6-Month E-Waste Collection &amp; Energy Recovery Trend
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-sky-200/70">
            Dual-axis monthly progression of collected e-waste (kg) and embodied smelting &amp; reuse energy recovered (kWh).
          </p>
        </div>

        {/* Interactive Legend Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!showCollection || showEnergy) setShowCollection((v) => !v);
            }}
            aria-pressed={showCollection}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer inline-flex items-center gap-2 ${
              showCollection
                ? 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200'
                : 'border-slate-200 dark:border-sky-900/50 text-slate-400 dark:text-sky-200/40'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 dark:bg-sky-400" />
            <span>E-Waste Collected (kg)</span>
            {summary.collectionGrowthPct !== 0 && (
              <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
                {summary.collectionGrowthPct > 0 ? '+' : ''}
                {summary.collectionGrowthPct}%
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!showEnergy || showCollection) setShowEnergy((v) => !v);
            }}
            aria-pressed={showEnergy}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer inline-flex items-center gap-2 ${
              showEnergy
                ? 'border-indigo-300 dark:border-indigo-700/80 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200'
                : 'border-slate-200 dark:border-sky-900/50 text-slate-400 dark:text-sky-200/40'
            }`}
          >
            <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-600 dark:border-indigo-400" />
            <span>Energy Recovered (kWh)</span>
            {summary.energyGrowthPct !== 0 && (
              <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-300">
                {summary.energyGrowthPct > 0 ? '+' : ''}
                {summary.energyGrowthPct}%
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Responsive D3 SVG Canvas + Floating Tooltip */}
      <div ref={containerRef} className="relative w-full">
        <svg
          ref={svgRef}
          role="img"
          aria-label="D3 dual-axis line chart showing monthly e-waste collection in kilograms and energy recovered in kilowatt-hours over the last six months"
          className="w-full h-[290px] block select-none overflow-visible"
        />

        {hoveredPoint && (
          <div
            style={{ left: `${tooltipLeftPct}%` }}
            className="pointer-events-none absolute top-2 -translate-x-1/2 z-20 min-w-[205px] rounded-xl border border-sky-200 dark:border-sky-700/80 bg-white/95 dark:bg-[#061526]/95 backdrop-blur-md shadow-xl px-3.5 py-2.5 text-xs space-y-1.5"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-sky-900/60 pb-1">
              <span className="font-semibold text-slate-900 dark:text-sky-50">
                {hoveredPoint.label}
              </span>
              <span className="text-[10px] font-mono text-sky-700 dark:text-sky-300">
                {hoveredPoint.isLiveMonth ? 'Live Ledger' : 'Historical Baseline'}
              </span>
            </div>

            {showCollection && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-sky-200/80">
                  <span className="w-2 h-2 rounded-full bg-sky-600 dark:bg-sky-400" />
                  Collected
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-sky-50">
                  {hoveredPoint.collectedKg.toLocaleString()} kg
                  {prevPoint && prevPoint.collectedKg > 0 && (
                    <span className="ml-1 text-[10px] text-sky-600 dark:text-sky-400">
                      ({hoveredPoint.collectedKg >= prevPoint.collectedKg ? '+' : ''}
                      {Math.round(
                        ((hoveredPoint.collectedKg - prevPoint.collectedKg) / prevPoint.collectedKg) * 100
                      )}
                      %)
                    </span>
                  )}
                </span>
              </div>
            )}

            {showEnergy && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-sky-200/80">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                  Energy Saved
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-sky-50">
                  {hoveredPoint.energyRecoveredKwh.toLocaleString()} kWh
                  {prevPoint && prevPoint.energyRecoveredKwh > 0 && (
                    <span className="ml-1 text-[10px] text-indigo-600 dark:text-indigo-400">
                      ({hoveredPoint.energyRecoveredKwh >= prevPoint.energyRecoveredKwh ? '+' : ''}
                      {Math.round(
                        ((hoveredPoint.energyRecoveredKwh - prevPoint.energyRecoveredKwh) /
                          prevPoint.energyRecoveredKwh) *
                          100
                      )}
                      %)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-sky-900/50 text-[11px] text-slate-500 dark:text-sky-200/65">
        <span>Hover across any month to inspect exact kg collected, kWh recovered, and month-over-month delta.</span>
        <span className="font-mono">Solid: E-Waste (kg) · Dashed: Energy (kWh)</span>
      </div>
    </div>
  );
};
