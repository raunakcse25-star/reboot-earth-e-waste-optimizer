import laptopServerImg from '../assets/images/insights_diy_laptop_server_1795783024164.jpg';
import smartphoneHomeImg from '../assets/images/insights_smartphone_dashcam_1795783037368.jpg';
import cableMinimalismImg from '../assets/images/insights_cable_minimalism_1795783040148.jpg';
import urbanMiningImg from '../assets/images/insights_urban_mining_1795783045251.jpg';

export type InsightCategory = 'DIY E-Waste Repurposing' | 'Sustainable Living';

export interface InsightSectionBlock {
  heading: string;
  paragraphs: string[];
  checklist?: string[];
}

export interface RecyclingInsightPost {
  id: string;
  issueNumber: number;
  weekLabel: string;
  publishedDate: string;
  category: InsightCategory;
  title: string;
  deck: string;
  author: string;
  authorRole: string;
  readTimeMinutes: number;
  guideFormat: string;
  impactHighlight: string;
  coverImage?: string;
  imageAlt?: string;
  imageCaption?: string;
  pullQuote: string;
  sections: InsightSectionBlock[];
  takeaways: string[];
}

export const RECYCLING_INSIGHTS_POSTS: RecyclingInsightPost[] = [
  {
    id: 'diy-old-laptop-home-server',
    issueNumber: 48,
    weekLabel: 'Week 48 · Nov 24, 2026',
    publishedDate: '2026-11-24',
    category: 'DIY E-Waste Repurposing',
    title: 'Turn an Old Laptop Into a Silent Home Media & Backup Server in 45 Minutes',
    deck: 'Before retiring a sluggish 6-year-old laptop, strip away desktop bloat and repurpose its low-wattage processor, built-in UPS battery, and storage bay into a 24/7 private cloud.',
    author: 'Ananya Deshmukh',
    authorRole: 'Hardware Circularity Editor',
    readTimeMinutes: 7,
    guideFormat: 'Beginner DIY · 45 min',
    impactHighlight: 'Preserves ~260 kg CO₂e of embodied manufacturing emissions',
    coverImage: laptopServerImg,
    imageAlt: 'Repurposed matte-black laptop running as a silent home server beside an external SSD on an oak desk',
    imageCaption: 'Fig. 1 — A six-year-old matte-black notebook configured as a lid-closed headless server drawing under 9 watts at idle.',
    pullQuote: 'An aging laptop already includes three things every home server builder pays extra for: a low-TDP CPU, a built-in keyboard/screen for troubleshooting, and an integrated battery backup.',
    sections: [
      {
        heading: 'Why Old Laptops Beat Dedicated Mini-PCs for Sustainability',
        paragraphs: [
          'Roughly 75% to 85% of a notebook computer’s lifetime carbon footprint occurs before you ever power it on—during silicon wafer fabrication, aluminum chassis milling, and lithium cell assembly. Even when a five-year-old machine struggles to run modern web browsers with thirty open tabs, its dual- or quad-core CPU is vastly overpowered for file syncing, local photo backups, ad-blocking DNS, or streaming media to a living room television.',
          'Better still, unlike an old desktop tower that idles at 60–90 watts, a typical laptop with its display switched off draws just 7 to 14 watts. Over a full year of continuous operation, that keeps electricity usage comparable to a single LED bulb while keeping 1.6 kg of multi-material electronics out of the waste stream.',
        ],
      },
      {
        heading: 'Preparation & Battery Safety First',
        paragraphs: [
          'Before running any machine 24/7, inspect the bottom chassis and trackpad for signs of battery swelling. If the pack is physically bulging, remove it carefully and schedule a certified battery pickup—never run a swollen lithium cell continuously on AC power. If the battery is healthy, enter your BIOS/UEFI firmware and enable a 60% or 80% maximum charge threshold so the pack stays cool while acting as a miniature uninterruptible power supply during brief grid flickers.',
        ],
        checklist: [
          'Back up personal files and clean dust out of the cooling fan and exhaust fins.',
          'Set BIOS battery charge threshold to 60–80% (or remove a worn-out pack safely).',
          'Download Ubuntu Server LTS or CasaOS onto an 8 GB USB flash drive.',
          'Connect directly to your router via Ethernet for stable local transfer speeds.',
        ],
      },
      {
        heading: 'Configure Lid-Closed Operation & Local Services',
        paragraphs: [
          'Once a lightweight headless Linux image is installed, edit /etc/systemd/logind.conf and set HandleLidSwitch=ignore so the laptop continues serving files silently with the screen closed. From there, a single container stack lets you run Immich for private family photo backups, Jellyfin for local films, or Syncthing to keep documents mirrored across household devices without monthly cloud subscriptions.',
        ],
      },
    ],
    takeaways: [
      'A lid-closed older laptop idles around 8–12 W—far lower than retired desktop towers.',
      'Always cap charge at 60–80% in BIOS or remove swollen packs before 24/7 plugged-in use.',
      'Extending a laptop’s service life by 3 years defers roughly 260 kg CO₂e in replacement manufacturing.',
    ],
  },
  {
    id: 'diy-retired-smartphone-five-roles',
    issueNumber: 47,
    weekLabel: 'Week 47 · Nov 17, 2026',
    publishedDate: '2026-11-17',
    category: 'DIY E-Waste Repurposing',
    title: 'Five Zero-Cost Ways to Repurpose a Retired Smartphone Around Your Home',
    deck: 'Old handsets pack high-resolution cameras, MEMS microphones, ambient sensors, and bright displays—far too capable to sit forgotten in a kitchen drawer.',
    author: 'Rohan Kulkarni',
    authorRole: 'DIY Reuse Contributor',
    readTimeMinutes: 5,
    guideFormat: 'Beginner DIY · 20 min',
    impactHighlight: 'Extends ~70 kg CO₂e handset lifecycle by 2–4 years',
    coverImage: smartphoneHomeImg,
    imageAlt: 'Retired smartphone mounted on a minimalist oak wall stand displaying a home temperature and plant moisture monitor',
    imageCaption: 'Fig. 2 — A retired handset mounted on an oak bracket functioning as a dedicated indoor climate and plant-care console.',
    pullQuote: 'The greenest smart-home gadget you can own is the drawer phone you already paid for four years ago.',
    sections: [
      {
        heading: 'Audit Before You Recycle',
        paragraphs: [
          'Industry surveys estimate that more than 5 billion mobile phones sit idle in drawers worldwide—neither reused nor recycled. When a handset stops receiving flagship OS updates or drops to 72% battery health, it may no longer survive a full workday on cellular data, yet it remains remarkably reliable over home Wi-Fi when paired with a simple low-wattage USB power schedule.',
        ],
      },
      {
        heading: 'Five Practical Second-Life Builds',
        paragraphs: [
          'Start with a factory reset and strip away social apps, email accounts, and push notifications. Keeping only one single-purpose app installed reduces heat, preserves flash storage, and transforms the device into a calm household utility.',
        ],
        checklist: [
          'Wall-Mounted Home & Plant Monitor: Pair with a smart-plug timer (charging 2 hours/day) to display indoor humidity, weather, and watering schedules.',
          'Dedicated Offline Navigation & Music Unit: Load offline maps and podcasts for road trips without draining your primary phone battery.',
          'HD Webcam for Video Calls: Use an open-source USB webcam bridge to replace grainy built-in laptop webcams.',
          'Pet or Front-Door Motion Monitor: Mount on a reused tripod for local-network live viewing while away.',
          'Digital Kitchen Timer & E-Reader: Keep recipes, timers, and audiobooks completely distraction-free.',
        ],
      },
      {
        heading: 'Know When It Is Time to Recycle Instead',
        paragraphs: [
          'If the glass is shattered with exposed sharp edges, the battery swells, or the charging port overheats, skip DIY repurposing altogether. Wipe your data if the screen responds, and route the device through a certified e-waste collector so its cobalt, gold, palladium, and rare-earth magnets return to the supply chain.',
        ],
      },
    ],
    takeaways: [
      'Factory-resetting and installing a single utility app keeps older handsets responsive and cool.',
      'Pair always-mounted phones with a smart plug timer so the battery is not pinned at 100% 24/7.',
      'Never repurpose a phone showing battery bulge or charging port heat—recycle it promptly.',
    ],
  },
  {
    id: 'sustainable-one-cable-home',
    issueNumber: 46,
    weekLabel: 'Week 46 · Nov 10, 2026',
    publishedDate: '2026-11-10',
    category: 'Sustainable Living',
    title: 'The One-Cable Home: Cutting Charger Clutter and Phantom Standby Power',
    deck: 'Replacing a drawer full of proprietary power bricks with shared USB-C Power Delivery and switched strips cuts e-waste volume and lowers household vampire draw.',
    author: 'Meera Krishnan',
    authorRole: 'Sustainable Living Columnist',
    readTimeMinutes: 6,
    guideFormat: 'Living Guide · Home Audit',
    impactHighlight: 'Eliminates 4–8 redundant adapters & ~85 kWh/yr standby waste',
    coverImage: cableMinimalismImg,
    imageAlt: 'Overhead editorial photo of neatly coiled braided USB-C cables, a compact GaN charger, and a wooden tray on travertine stone',
    imageCaption: 'Fig. 3 — Consolidating four device-specific bricks into a single multi-port GaN Power Delivery hub and braided USB-C leads.',
    pullQuote: 'Every redundant charger left plugged into an empty wall socket quietly turns electricity into low-grade heat all year long.',
    sections: [
      {
        heading: 'The Hidden Footprint of Spare Chargers',
        paragraphs: [
          'External power supplies and tangled cable bundles are among the fastest-growing segments of small household e-waste. Globally, redundant mobile and laptop chargers account for tens of thousands of tonnes of copper, polycarbonate plastics, and epoxy-potted circuit boards discarded every year—often while still working perfectly.',
          'Standardizing on USB-C Power Delivery (PD) and compact Gallium Nitride (GaN) multi-port hubs means a single 65W wall adapter can safely negotiate voltage for your laptop, tablet, headphones, and phone—drastically reducing how many bricks you buy, carry, and eventually discard.',
        ],
      },
      {
        heading: 'A 15-Minute Household Cable & Standby Audit',
        paragraphs: [
          'Gather every loose adapter and cable in your home onto one table and sort them into three clean piles: active daily cables, functional spares worth donating on the Circular Marketplace, and frayed or cracked cords ready for copper recovery.',
        ],
        checklist: [
          'Test working surplus HDMI, USB-C, and OEM laptop bricks and list extras on the Circular Marketplace for neighbors who need an exact replacement.',
          'Discard any cable with exposed inner conductors or bent pins directly into a verified e-waste pickup—never regular trash.',
          'Group desk monitors, speakers, and chargers onto a single switched surge strip so one flick cuts phantom standby power overnight.',
          'Store active cables in loose over-under loops rather than tight knots to triple connector strain-relief lifespan.',
        ],
      },
    ],
    takeaways: [
      'Sharing one multi-port USB-C PD charger replaces 3 to 5 single-device plastic power bricks.',
      'Working surplus cables and chargers have high community reuse demand on the Circular Marketplace.',
      'Switching off idle desk strips typically saves 5% to 8% of small-electronics electricity consumption.',
    ],
  },
  {
    id: 'urban-mining-circuit-boards',
    issueNumber: 45,
    weekLabel: 'Week 45 · Nov 03, 2026',
    publishedDate: '2026-11-03',
    category: 'Sustainable Living',
    title: 'Inside Urban Mining: Why One Ton of Circuit Boards Holds More Gold Than Ore',
    deck: 'A clear-eyed look at how certified hydrometallurgical recyclers recover copper, gold, silver, and palladium—and why informal acid burning destroys both value and health.',
    author: 'Dr. Vikramaditya Rao',
    authorRole: 'Materials Recovery Advisor',
    readTimeMinutes: 8,
    guideFormat: 'Deep Dive · Circular Economy',
    impactHighlight: '1 tonne of PCBs yields ~250–350 g gold vs ~3–5 g in mined ore',
    coverImage: urbanMiningImg,
    imageAlt: 'Macro photograph of emerald-green electronic circuit boards with gold edge connectors and copper toroidal coils on a steel lab tray',
    imageCaption: 'Fig. 4 — High-grade edge connectors and copper inductors separated during pre-processing before closed-loop metal refining.',
    pullQuote: 'Discarded electronics are not trash—they are the highest-grade polymetallic ore body on Earth, already sitting above ground in our cities.',
    sections: [
      {
        heading: 'Comparing Primary Mining to Certified Urban Mining',
        paragraphs: [
          'Conventional hard-rock gold mining often requires excavating, crushing, and chemically processing an entire tonne of raw earth to extract just 3 to 5 grams of gold. By contrast, a single tonne of sorted motherboards and telecom circuit boards typically contains 200 to 350 grams of gold, over 130 kilograms of copper, plus recoverable silver, tin, and palladium.',
          'When consumers channel retired routers, laptops, and desktops into authorized recyclers instead of landfills or unorganized scrap burning, the energy required to refine secondary copper and aluminum drops by 80% to 95% compared to virgin ore smelting.',
        ],
      },
      {
        heading: 'Why Certified Channelization Matters',
        paragraphs: [
          'Informal backyard recycling relies on open-air cable burning and uncontrolled acid baths to strip metals—recovering less than 25% of the precious metal value while releasing dioxins, lead dust, and heavy-metal runoff into neighborhood soil and groundwater.',
          'Authorized CPCB-compliant facilities reverse that equation using mechanical shredding, eddy-current separation, density sorting, and closed-loop hydrometallurgy with exhaust scrubbing—capturing over 92% of target metals safely.',
        ],
        checklist: [
          'Keep circuit boards and batteries intact before pickup—never attempt DIY chemical gold stripping at home.',
          'Always verify that your chosen drop-off hub or collector provides transparent batch weight tracking.',
          'Separate working modular parts (RAM sticks, SSDs, cooling fans) for direct reuse before recycling non-functional boards.',
        ],
      },
    ],
    takeaways: [
      'Sorted circuit boards hold roughly 40× to 80× the gold concentration of primary mined ore.',
      'Closed-loop recycling cuts aluminum and copper refining energy by over 80% compared to virgin mining.',
      'Direct component reuse still beats material recycling whenever a part remains functional.',
    ],
  },
  {
    id: 'diy-salvage-desktop-fans-power',
    issueNumber: 44,
    weekLabel: 'Week 44 · Oct 27, 2026',
    publishedDate: '2026-10-27',
    category: 'DIY E-Waste Repurposing',
    title: 'DIY Bench Guide: Salvaging 12V Cooling Fans & Magnets From Retired Desktop PCs',
    deck: 'Before sending a dead desktop chassis for metal recovery, spend ten minutes harvesting whisper-quiet brushless fans, neodymium hard-drive magnets, and standard screws.',
    author: 'Kabir Malhotra',
    authorRole: 'Maker & Repair Contributor',
    readTimeMinutes: 5,
    guideFormat: 'Intermediate DIY · 25 min',
    impactHighlight: 'Reuses precision brushless motors built for 40,000+ hour duty',
    pullQuote: 'A desktop PC rarely dies all at once—usually one capacitor fails while six durable mechanical assemblies still have decades of life left.',
    sections: [
      {
        heading: 'High-Value Components Worth Salvaging Safely',
        paragraphs: [
          'Desktop computers are built from standardized modular fasteners and electro-mechanical parts that outlast motherboard generations. Brushless 12V case fans (80mm or 120mm) run quietly on recycled 5V USB phone chargers at gentle speeds—ideal for cooling Wi-Fi routers inside closed cabinets, building a soldering fume extractor with an activated carbon filter pad, or ventilating indoor seedling trays.',
        ],
        checklist: [
          'Safety First: Unplug the PC and NEVER open the sealed metal power supply (PSU) box—its primary capacitors can hold lethal high-voltage charge even when unplugged.',
          'Harvest 12V brushless case fans (keep the 3-pin or 4-pin tail intact for easy wiring to a 5V or 12V spare adapter).',
          'Remove SATA data cables, thumbscrews, and standard M3/6-32 case screws into a labeled repair jar.',
          'After securely wiping and decommissioning a failing spinning hard drive, carefully extract its ultra-strong curved neodymium magnets for workshop tool holders.',
        ],
      },
      {
        heading: 'Recycle the Remaining Chassis Cleanly',
        paragraphs: [
          'Once your reusable mechanical hardware is harvested, keep the motherboard, PSU enclosure, RAM, and steel case together for your scheduled e-waste pickup. Steel frames and copper heatsinks remain 100% recyclable.',
        ],
      },
    ],
    takeaways: [
      'Never open a desktop PSU housing due to stored high-voltage capacitor risk.',
      'Running a 12V PC fan off a spare 5V USB charger creates a near-silent cabinet cooler.',
      'Keep salvaged SATA cables and spare screws organized—or donate them on Circular Marketplace.',
    ],
  },
  {
    id: 'sustainable-right-to-repair-habits',
    issueNumber: 43,
    weekLabel: 'Week 43 · Oct 20, 2026',
    publishedDate: '2026-10-20',
    category: 'Sustainable Living',
    title: 'Right to Repair at Home: 7 Simple Habits That Double Your Electronics’ Lifespan',
    deck: 'Extending every household device from three years to six cuts your personal e-waste footprint in half without giving up performance.',
    author: 'Priya Nair',
    authorRole: 'Circular Economy Analyst',
    readTimeMinutes: 6,
    guideFormat: 'Sustainable Living · Checklist',
    impactHighlight: 'Cuts personal annual e-waste generation by up to 50%',
    pullQuote: 'Maintenance is the quietest form of climate action: every year you add to an existing device is a year a factory does not have to mine new cobalt and silicon.',
    sections: [
      {
        heading: 'The Seven High-Leverage Longevity Habits',
        paragraphs: [
          'Most consumer devices are retired not because their processors fail, but because of three preventable wear points: degraded lithium batteries, clogged thermal vents, and damaged charging ports. Addressing those three failure modes requires minimal tools and zero engineering background.',
        ],
        checklist: [
          '1. Adopt the 20–80% Battery Rule: Keep daily lithium-ion charge between 20% and 80% whenever convenient to cut cyclic aging by nearly a third.',
          '2. Clear Thermal Vents Twice a Year: A quick burst of dry air across laptop fans prevents thermal throttling and extends motherboard solder joint life.',
          '3. Replace Batteries Before Replacing Devices: Swapping a worn pack on a healthy 3-year-old laptop restores 90% of its original utility at a fraction of the carbon cost.',
          '4. Upgrade Storage & RAM Modularly: Moving an older computer from a mechanical HDD to a modest SSD often eliminates the urge to buy new hardware.',
          '5. Protect USB Ports With Gentle Angles: Avoid resting phones or laptops directly on plugged-in charging connectors in bed or on sofas.',
          '6. Keep Firmware & Security Patches Current: Clean OS updates maintain battery management efficiency and extend safe usable life.',
          '7. Check Battery Health Annually: Use the Reboot Earth Battery Health Calculator to plan timely maintenance, second-life repurposing, or certified recycling.',
        ],
      },
    ],
    takeaways: [
      'Battery degradation, heat buildup, and port strain cause the majority of premature device retirements.',
      'Cleaning vents every six months and capping charge at 80% dramatically slows hardware aging.',
      'When a device truly reaches end of life, certified recycling ensures its metals re-enter production.',
    ],
  },
];
