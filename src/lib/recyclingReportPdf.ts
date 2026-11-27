import { jsPDF } from 'jspdf';
import type { Facility, PickupRequest } from '../types';
import {
  COLLECTED_HISTORY_STATUSES,
  getEmissionFactorForCategory,
} from '../components/CarbonSavedWidget';
import { computeEcoExperience } from './ecoLevelSystem';

export interface RecyclingPdfReportInput {
  pickups: PickupRequest[];
  facilities: Facility[];
  userName?: string;
  userEmail?: string;
  userRole?: string;
  userCity?: string;
}

interface CategorySummaryRow {
  category: string;
  pickupsCount: number;
  weightKg: number;
  factor: number;
  co2Kg: number;
  sharePct: number;
}

function sanitizePdfText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/CO₂e/g, 'CO2e')
    .replace(/CO₂/g, 'CO2')
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '|')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, maxLen: number): string {
  const clean = sanitizePdfText(text);
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 3))}...`;
}

export function generateRecyclingImpactPdf(input: RecyclingPdfReportInput): {
  fileName: string;
  totalRecycledKg: number;
  totalCo2Kg: number;
} {
  const { pickups, facilities, userName, userEmail, userRole, userCity } = input;

  const facilityById = new Map(facilities.map((f) => [f.id, f]));
  const nonCancelled = pickups.filter((p) => p.status !== 'Cancelled');
  const verifiedPickups = pickups.filter((p) => COLLECTED_HISTORY_STATUSES.has(p.status));
  const pendingPickups = pickups.filter(
    (p) => !COLLECTED_HISTORY_STATUSES.has(p.status) && p.status !== 'Cancelled'
  );

  // Use verified collected pickups for primary metrics if present, otherwise include active pipeline so new users still get a meaningful report
  const hasVerified = verifiedPickups.length > 0;
  const evaluatedForCarbon = hasVerified ? verifiedPickups : nonCancelled;

  const byCategoryMap = new Map<
    string,
    { pickupsCount: number; weightKg: number; factor: number; co2Kg: number }
  >();

  let verifiedWeightKg = 0;
  let verifiedCo2Kg = 0;
  for (const p of verifiedPickups) {
    const w = Math.max(0, Number(p.estimatedWeightKg) || 0);
    const f = getEmissionFactorForCategory(p.category).factorKgCo2PerKg;
    verifiedWeightKg += w;
    verifiedCo2Kg += w * f;
  }

  let pipelineWeightKg = 0;
  let pipelineCo2Kg = 0;
  for (const p of pendingPickups) {
    const w = Math.max(0, Number(p.estimatedWeightKg) || 0);
    const f = getEmissionFactorForCategory(p.category).factorKgCo2PerKg;
    pipelineWeightKg += w;
    pipelineCo2Kg += w * f;
  }

  let evalWeightKg = 0;
  let evalCo2Kg = 0;
  for (const p of evaluatedForCarbon) {
    const w = Math.max(0, Number(p.estimatedWeightKg) || 0);
    const factorInfo = getEmissionFactorForCategory(p.category);
    const c = w * factorInfo.factorKgCo2PerKg;
    evalWeightKg += w;
    evalCo2Kg += c;

    const key = p.category || 'Other Electronics';
    const existing = byCategoryMap.get(key);
    if (existing) {
      existing.pickupsCount += 1;
      existing.weightKg += w;
      existing.co2Kg += c;
    } else {
      byCategoryMap.set(key, {
        pickupsCount: 1,
        weightKg: w,
        factor: factorInfo.factorKgCo2PerKg,
        co2Kg: c,
      });
    }
  }

  const categoryBreakdown: CategorySummaryRow[] = Array.from(byCategoryMap.entries())
    .map(([category, row]) => ({
      category,
      pickupsCount: row.pickupsCount,
      weightKg: Number(row.weightKg.toFixed(1)),
      factor: row.factor,
      co2Kg: Number(row.co2Kg.toFixed(1)),
      sharePct: evalCo2Kg > 0 ? Math.round((row.co2Kg / evalCo2Kg) * 100) : 0,
    }))
    .sort((a, b) => b.co2Kg - a.co2Kg);

  const avgFactor = evalWeightKg > 0 ? evalCo2Kg / evalWeightKg : 0;
  const kmNotDriven = Math.round(evalCo2Kg / 0.21);
  const treeYears = Number((evalCo2Kg / 21.77).toFixed(1));
  const smartphonesCharged = Math.round(evalCo2Kg / 0.00822);

  // Experience level, badges & milestones (consistent with DashboardShell & UserProfilePanel)
  const ecoExp = computeEcoExperience(pickups, !hasVerified && nonCancelled.length > 0);

  // Initialize A4 Portrait PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const footerReserve = 16;

  // Color Palette (Ocean Navy + Sky + Emerald)
  const C = {
    navy: [9, 30, 54] as [number, number, number],
    navyLight: [15, 45, 79] as [number, number, number],
    sky: [2, 132, 199] as [number, number, number],
    skySoft: [239, 247, 255] as [number, number, number],
    emerald: [5, 150, 105] as [number, number, number],
    emeraldSoft: [236, 253, 245] as [number, number, number],
    amber: [180, 83, 9] as [number, number, number],
    amberSoft: [255, 251, 235] as [number, number, number],
    slate900: [15, 23, 42] as [number, number, number],
    slate600: [71, 85, 105] as [number, number, number],
    slate400: [148, 163, 184] as [number, number, number],
    border: [216, 226, 238] as [number, number, number],
    bgLight: [248, 250, 252] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  let cursorY = 14;

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > pageHeight - footerReserve) {
      doc.addPage();
      cursorY = 16;
    }
  };

  const drawSectionHeading = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 14 : 10);
    doc.setFillColor(...C.sky);
    doc.rect(marginX, cursorY, 2.2, 5.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.navy);
    doc.text(sanitizePdfText(title), marginX + 4.5, cursorY + 4.1);
    cursorY += 6.5;
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.slate600);
      doc.text(sanitizePdfText(subtitle), marginX + 4.5, cursorY + 1.5);
      cursorY += 4.5;
    } else {
      cursorY += 1.5;
    }
  };

  // =========================================================================
  // 1. HEADER BANNER
  // =========================================================================
  const generatedNow = new Date();
  const dateStamp = generatedNow.toISOString().slice(0, 10);
  const reportId = `RE-RPT-${dateStamp.replace(/-/g, '')}-${String(pickups.length).padStart(3, '0')}`;

  doc.setFillColor(...C.navy);
  doc.roundedRect(marginX, cursorY, contentWidth, 34, 3, 3, 'F');

  // Accent strip along top of header
  doc.setFillColor(...C.emerald);
  doc.rect(marginX, cursorY, contentWidth, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...C.white);
  doc.text('REBOOT EARTH', marginX + 6, cursorY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 230, 253);
  doc.text('Personal E-Waste Recycling, Carbon Savings & Milestones Report', marginX + 6, cursorY + 17);

  // User metadata row inside banner
  const accountLine = [
    userName ? `Member: ${sanitizePdfText(userName)}` : null,
    userEmail ? sanitizePdfText(userEmail) : null,
    userCity ? `Location: ${sanitizePdfText(userCity)}` : null,
    userRole ? `Role: ${sanitizePdfText(userRole)}` : null,
  ]
    .filter(Boolean)
    .join('  |  ');

  doc.setFontSize(7.8);
  doc.setTextColor(224, 242, 254);
  doc.text(
    truncateText(accountLine || 'Verified Reboot Earth Recycling Account', 105),
    marginX + 6,
    cursorY + 25.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 197, 235);
  doc.text(
    `Scope: ${hasVerified ? 'Verified Collected & Completed Pickups' : 'Logged Active Pickups (Pre-Collection Preview)'}`,
    marginX + 6,
    cursorY + 30.5
  );

  // Right side Report ID & Generated Date
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text(reportId, marginX + contentWidth - 6, cursorY + 11, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(186, 230, 253);
  doc.text(
    `Generated: ${generatedNow.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}`,
    marginX + contentWidth - 6,
    cursorY + 16.5,
    { align: 'right' }
  );

  cursorY += 40;

  // =========================================================================
  // 2. EXECUTIVE KPI SUMMARY CARDS (4-column grid)
  // =========================================================================
  const cardGap = 3.5;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 25;

  const kpiCards = [
    {
      label: 'TOTAL E-WASTE RECYCLED',
      value: `${evalWeightKg.toFixed(1)} kg`,
      sub:
        hasVerified && pipelineWeightKg > 0
          ? `+${pipelineWeightKg.toFixed(1)} kg scheduled`
          : `${evaluatedForCarbon.length} ${evaluatedForCarbon.length === 1 ? 'pickup' : 'pickups'} logged`,
      bg: C.skySoft,
      accent: C.sky,
    },
    {
      label: 'CARBON AVOIDED (CO2e)',
      value:
        evalCo2Kg >= 1000
          ? `${(evalCo2Kg / 1000).toFixed(2)} t`
          : `${evalCo2Kg.toFixed(1)} kg`,
      sub: avgFactor > 0 ? `Avg ${avgFactor.toFixed(2)} kg CO2e/kg` : 'Material-weighted',
      bg: C.emeraldSoft,
      accent: C.emerald,
    },
    {
      label: 'EXPERIENCE LEVEL',
      value: `Lvl ${ecoExp.currentTier.level}`,
      sub: `${ecoExp.currentTier.title} (${ecoExp.xp.toLocaleString()} XP)`,
      bg: C.bgLight,
      accent: C.navy,
    },
    {
      label: 'MILESTONES & BADGES',
      value: `${ecoExp.unlockedMilestonesCount}/${ecoExp.milestones.length}`,
      sub: `${ecoExp.unlockedBadgesCount}/${ecoExp.badges.length} badges unlocked`,
      bg: C.amberSoft,
      accent: C.amber,
    },
  ];

  kpiCards.forEach((card, idx) => {
    const x = marginX + idx * (cardWidth + cardGap);
    doc.setFillColor(...card.bg);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, cursorY, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFillColor(...card.accent);
    doc.rect(x, cursorY, cardWidth, 1.3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...C.slate600);
    doc.text(card.label, x + 3, cursorY + 6.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...card.accent);
    doc.text(card.value, x + 3, cursorY + 14.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.slate600);
    doc.text(truncateText(card.sub, 26), x + 3, cursorY + 21.2);
  });

  cursorY += cardHeight + 4.5;

  // Real-World Equivalencies Strip
  doc.setFillColor(...C.bgLight);
  doc.setDrawColor(...C.border);
  doc.roundedRect(marginX, cursorY, contentWidth, 12.5, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.navy);
  doc.text('ENVIRONMENTAL EQUIVALENCIES:', marginX + 4, cursorY + 7.4);

  const equivText = `${kmNotDriven.toLocaleString()} car km avoided   |   ${treeYears.toLocaleString()} mature tree-years   |   ${smartphonesCharged.toLocaleString()} smartphone charges`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.emerald);
  doc.text(equivText, marginX + 54, cursorY + 7.4);

  cursorY += 18;

  // =========================================================================
  // 3. MATERIAL-WEIGHTED CARBON SAVINGS BREAKDOWN
  // =========================================================================
  drawSectionHeading(
    'Carbon Savings Breakdown by E-Waste Category',
    'Formula: Total CO2e Avoided = Sum(Weight_kg x Category Emission Factor) aligned with EPA WARM / UNEP recovery benchmarks.'
  );

  if (categoryBreakdown.length === 0) {
    ensureSpace(12);
    doc.setFillColor(...C.bgLight);
    doc.setDrawColor(...C.border);
    doc.roundedRect(marginX, cursorY, contentWidth, 11, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.slate600);
    doc.text(
      'No non-cancelled pickups recorded yet. Schedule a pickup to generate category-weighted carbon metrics.',
      marginX + 4,
      cursorY + 6.8
    );
    cursorY += 16;
  } else {
    // Table Header
    const colX = [
      marginX + 2,
      marginX + 56,
      marginX + 74,
      marginX + 98,
      marginX + 126,
      marginX + 154,
    ];
    ensureSpace(14);
    doc.setFillColor(...C.navyLight);
    doc.rect(marginX, cursorY, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...C.white);
    doc.text('Material Category', colX[0], cursorY + 4.8);
    doc.text('Logs', colX[1], cursorY + 4.8);
    doc.text('Weight (kg)', colX[2], cursorY + 4.8);
    doc.text('Factor (CO2e/kg)', colX[3], cursorY + 4.8);
    doc.text('CO2e Avoided', colX[4], cursorY + 4.8);
    doc.text('Share', colX[5], cursorY + 4.8);
    cursorY += 7;

    categoryBreakdown.forEach((row, idx) => {
      ensureSpace(8);
      if (idx % 2 === 1) {
        doc.setFillColor(...C.bgLight);
        doc.rect(marginX, cursorY, contentWidth, 7.2, 'F');
      }
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      doc.line(marginX, cursorY + 7.2, marginX + contentWidth, cursorY + 7.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C.slate900);
      doc.text(truncateText(row.category, 30), colX[0], cursorY + 4.9);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.slate600);
      doc.text(String(row.pickupsCount), colX[1], cursorY + 4.9);
      doc.text(`${row.weightKg.toFixed(1)} kg`, colX[2], cursorY + 4.9);
      doc.text(`${row.factor.toFixed(2)}x`, colX[3], cursorY + 4.9);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.emerald);
      doc.text(`${row.co2Kg.toFixed(1)} kg`, colX[4], cursorY + 4.9);

      // Visual share bar + percentage
      const barX = colX[5];
      const barW = 16;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, cursorY + 2.4, barW, 2.4, 0.8, 0.8, 'F');
      doc.setFillColor(...C.emerald);
      doc.roundedRect(
        barX,
        cursorY + 2.4,
        Math.max(1.2, (barW * Math.min(100, row.sharePct)) / 100),
        2.4,
        0.8,
        0.8,
        'F'
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.slate600);
      doc.text(`${row.sharePct}%`, barX + barW + 2, cursorY + 4.8);

      cursorY += 7.2;
    });

    // Totals Row
    ensureSpace(8.5);
    doc.setFillColor(...C.emeraldSoft);
    doc.rect(marginX, cursorY, contentWidth, 7.5, 'F');
    doc.setDrawColor(...C.emerald);
    doc.setLineWidth(0.3);
    doc.line(marginX, cursorY + 7.5, marginX + contentWidth, cursorY + 7.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.navy);
    doc.text('TOTAL EVALUATED IMPACT', colX[0], cursorY + 5.1);
    doc.text(String(evaluatedForCarbon.length), colX[1], cursorY + 5.1);
    doc.text(`${evalWeightKg.toFixed(1)} kg`, colX[2], cursorY + 5.1);
    doc.text(`${avgFactor.toFixed(2)} avg`, colX[3], cursorY + 5.1);
    doc.setTextColor(...C.emerald);
    doc.text(`${evalCo2Kg.toFixed(1)} kg CO2e`, colX[4], cursorY + 5.1);
    doc.setTextColor(...C.navy);
    doc.text('100%', colX[5] + 18, cursorY + 5.1);

    cursorY += 12.5;
  }

  // =========================================================================
  // 4. EXPERIENCE LEVEL, MILESTONES & ACHIEVEMENT BADGES
  // =========================================================================
  drawSectionHeading(
    'Recycling Experience Level, Milestones & Badges',
    `Current Standing: Level ${ecoExp.currentTier.level} - ${ecoExp.currentTier.title} (${ecoExp.xp.toLocaleString()} Eco XP | ${ecoExp.totalRecycledKg.toFixed(1)} kg evaluated)`
  );

  // Level Progress Box
  ensureSpace(16);
  doc.setFillColor(...C.skySoft);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, cursorY, contentWidth, 14, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.navy);
  doc.text(
    `Level ${ecoExp.currentTier.level}: ${ecoExp.currentTier.title}`,
    marginX + 4,
    cursorY + 5.5
  );

  const nextLevelLabel = ecoExp.nextTier
    ? `${ecoExp.kgToNextLevel} kg to Level ${ecoExp.nextTier.level} (${ecoExp.nextTier.title}) - ${ecoExp.levelProgressPct}%`
    : 'Maximum Tier Reached (100%)';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...C.sky);
  doc.text(nextLevelLabel, marginX + contentWidth - 4, cursorY + 5.5, { align: 'right' });

  // Progress bar
  const lvlBarX = marginX + 4;
  const lvlBarW = contentWidth - 8;
  doc.setFillColor(203, 213, 225);
  doc.roundedRect(lvlBarX, cursorY + 8.5, lvlBarW, 2.8, 1.2, 1.2, 'F');
  doc.setFillColor(...C.sky);
  doc.roundedRect(
    lvlBarX,
    cursorY + 8.5,
    Math.max(2, (lvlBarW * Math.min(100, ecoExp.levelProgressPct)) / 100),
    2.8,
    1.2,
    1.2,
    'F'
  );

  cursorY += 18;

  // Milestones Table
  const msX = [marginX + 2, marginX + 54, marginX + 76, marginX + 104, marginX + 128];
  ensureSpace(14);
  doc.setFillColor(...C.navyLight);
  doc.rect(marginX, cursorY, contentWidth, 6.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(...C.white);
  doc.text('Milestone', msX[0], cursorY + 4.7);
  doc.text('Target', msX[1], cursorY + 4.7);
  doc.text('Status', msX[2], cursorY + 4.7);
  doc.text('Progress', msX[3], cursorY + 4.7);
  doc.text('Milestone Perk', msX[4], cursorY + 4.7);
  cursorY += 6.8;

  ecoExp.milestones.forEach((ms, idx) => {
    ensureSpace(7.5);
    if (idx % 2 === 1) {
      doc.setFillColor(...C.bgLight);
      doc.rect(marginX, cursorY, contentWidth, 6.8, 'F');
    }
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    doc.line(marginX, cursorY + 6.8, marginX + contentWidth, cursorY + 6.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...C.slate900);
    doc.text(truncateText(ms.title, 28), msX[0], cursorY + 4.6);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate600);
    doc.text(`${ms.targetKg} kg`, msX[1], cursorY + 4.6);

    doc.setFont('helvetica', 'bold');
    if (ms.unlocked) {
      doc.setTextColor(...C.emerald);
      doc.text('UNLOCKED', msX[2], cursorY + 4.6);
    } else {
      doc.setTextColor(...C.amber);
      doc.text(`${ms.remainingKg} kg left`, msX[2], cursorY + 4.6);
    }

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate600);
    doc.text(`${ms.progressPct}%`, msX[3], cursorY + 4.6);
    doc.text(truncateText(ms.perk, 38), msX[4], cursorY + 4.6);

    cursorY += 6.8;
  });

  cursorY += 5;

  // Achievement Badges Grid (2 columns)
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.navy);
  doc.text(
    `Achievement Badges (${ecoExp.unlockedBadgesCount} of ${ecoExp.badges.length} Unlocked)`,
    marginX,
    cursorY + 3.5
  );
  cursorY += 6;

  const badgeColW = (contentWidth - 4) / 2;
  for (let i = 0; i < ecoExp.badges.length; i += 2) {
    ensureSpace(13);
    const pair = ecoExp.badges.slice(i, i + 2);
    pair.forEach((badge, colIdx) => {
      const bx = marginX + colIdx * (badgeColW + 4);
      doc.setFillColor(...(badge.unlocked ? C.emeraldSoft : C.bgLight));
      doc.setDrawColor(...(badge.unlocked ? C.emerald : C.border));
      doc.setLineWidth(0.2);
      doc.roundedRect(bx, cursorY, badgeColW, 11.5, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...(badge.unlocked ? C.emerald : C.slate600));
      doc.text(
        `${badge.unlocked ? '[UNLOCKED]' : '[LOCKED]'} ${truncateText(badge.name, 24)}`,
        bx + 2.8,
        cursorY + 4.6
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.slate600);
      doc.text(
        truncateText(`${badge.currentLabel} (${badge.progressPct}%) - ${badge.description}`, 52),
        bx + 2.8,
        cursorY + 9
      );
    });
    cursorY += 13;
  }

  cursorY += 3;

  // =========================================================================
  // 5. DETAILED PICKUP HISTORY LOG TABLE
  // =========================================================================
  drawSectionHeading(
    'Pickup History & Chain-of-Custody Log',
    `Showing ${pickups.length} logged e-waste collection record${pickups.length === 1 ? '' : 's'} sorted chronologically (newest first).`
  );

  const sortedPickups = [...pickups].sort((a, b) => {
    const tsA = Date.parse(a.createdAt || a.preferredDate || '') || 0;
    const tsB = Date.parse(b.createdAt || b.preferredDate || '') || 0;
    return tsB - tsA;
  });

  const histX = [
    marginX + 2,
    marginX + 24,
    marginX + 46,
    marginX + 104,
    marginX + 123,
    marginX + 143,
  ];

  const drawHistoryTableHeader = () => {
    doc.setFillColor(...C.navyLight);
    doc.rect(marginX, cursorY, contentWidth, 6.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...C.white);
    doc.text('Code', histX[0], cursorY + 4.6);
    doc.text('Date', histX[1], cursorY + 4.6);
    doc.text('Device & Category', histX[2], cursorY + 4.6);
    doc.text('Weight', histX[3], cursorY + 4.6);
    doc.text('Est. CO2e', histX[4], cursorY + 4.6);
    doc.text('Status / Center', histX[5], cursorY + 4.6);
    cursorY += 6.8;
  };

  if (sortedPickups.length === 0) {
    ensureSpace(12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...C.slate600);
    doc.text('No e-waste pickups have been recorded on this account yet.', marginX + 2, cursorY + 5);
    cursorY += 10;
  } else {
    ensureSpace(16);
    drawHistoryTableHeader();

    sortedPickups.forEach((p, idx) => {
      if (cursorY + 9.5 > pageHeight - footerReserve) {
        doc.addPage();
        cursorY = 16;
        drawHistoryTableHeader();
      }

      const rowH = 9.2;
      if (idx % 2 === 1) {
        doc.setFillColor(...C.bgLight);
        doc.rect(marginX, cursorY, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      doc.line(marginX, cursorY + rowH, marginX + contentWidth, cursorY + rowH);

      const weight = Math.max(0, Number(p.estimatedWeightKg) || 0);
      const factor = getEmissionFactorForCategory(p.category).factorKgCo2PerKg;
      const co2 = p.status === 'Cancelled' ? 0 : weight * factor;
      const fac = p.assignedFacilityId ? facilityById.get(p.assignedFacilityId) : undefined;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...C.sky);
      doc.text(truncateText(p.requestCode, 13), histX[0], cursorY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...C.slate600);
      doc.text(truncateText(p.preferredDate || '-', 12), histX[1], cursorY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.slate900);
      doc.text(truncateText(p.deviceName, 34), histX[2], cursorY + 4.1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(...C.slate600);
      doc.text(
        truncateText(`${p.category} (${p.quantity} units)`, 36),
        histX[2],
        cursorY + 7.6
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.slate900);
      doc.text(`${weight.toFixed(1)} kg`, histX[3], cursorY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(p.status === 'Cancelled' ? C.slate400 : C.emerald));
      doc.text(
        p.status === 'Cancelled' ? '0.0 kg' : `${co2.toFixed(1)} kg`,
        histX[4],
        cursorY + 4.5
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(
        ...(p.status === 'Completed'
          ? C.emerald
          : p.status === 'Cancelled'
            ? C.amber
            : C.navy)
      );
      doc.text(truncateText(p.status, 22), histX[5], cursorY + 4.1);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.slate600);
      doc.text(
        truncateText(fac ? `${fac.name} (${fac.city})` : p.pickupAddress, 25),
        histX[5],
        cursorY + 7.6
      );

      cursorY += rowH;
    });
  }

  // =========================================================================
  // 6. PAGE FOOTERS ON EVERY PAGE
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...C.slate600);
    doc.text(
      'Reboot Earth Sustainability Impact Summary | Operational record for personal & ESG tracking; does not replace statutory CPCB EPR certificates.',
      marginX,
      pageHeight - 7.5
    );
    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - marginX, pageHeight - 7.5, {
      align: 'right',
    });
  }

  const fileName = `RebootEarth_Recycling_Report_${dateStamp}.pdf`;
  doc.save(fileName);

  return {
    fileName,
    totalRecycledKg: Number(evalWeightKg.toFixed(1)),
    totalCo2Kg: Number(evalCo2Kg.toFixed(1)),
  };
}
