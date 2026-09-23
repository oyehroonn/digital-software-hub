#!/usr/bin/env node
// DSM AI Labs — service page generator.
// Reads content/services.json (single source of truth) and emits:
//   1. One static HTML page per service into public/services/<slug>.html
//   2. The "What We Do" / "Solutions" footer nav block into public/services/offerings.html
//      (between <!-- SERVICES_FOOTER:START --> / <!-- SERVICES_FOOTER:END --> markers)
//   3. The auto-generated per-service AI-agent-brief section into public/services/llms.txt
//      (between <!-- AUTO-GENERATED SERVICE BRIEFS: START --> / END markers)
//
// Re-running this script (after deleting the generated HTML pages) regenerates everything
// identically — it is the only supported way to add/edit/remove a service page. Never
// hand-edit a generated page directly; edit content/services.json and re-run.
//
// Usage: node scripts/generate-service-pages.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'content', 'services.json');
const SERVICES_DIR = path.join(ROOT, 'public', 'services');
const OFFERINGS_PATH = path.join(SERVICES_DIR, 'offerings.html');
const LLMS_PATH = path.join(SERVICES_DIR, 'llms.txt');

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const { services, categories, sharedProof } = data;
const categoryById = Object.fromEntries(categories.map(c => [c.id, c]));

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Allow a small set of already-safe inline HTML entities (×, —, etc.) authored directly
// in the JSON as literal unicode characters — escapeHtml leaves those untouched since they
// aren't & < > " '. No raw HTML is ever permitted in content fields.

function svcCode(category) {
  return category.toUpperCase().replace(/-/g, '.');
}

function renderDeliverableCard(d) {
  return `        <div class="svc-card p-7">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 border border-zinc-900 rounded-lg flex items-center justify-center bg-white"><i data-lucide="${escapeHtml(d.icon)}" class="w-4.5 h-4.5" stroke-width="1.2"></i></div>
            <h4 class="text-lg font-medium text-zinc-900 tracking-tight">${escapeHtml(d.title)}</h4>
          </div>
          <p class="text-sm text-zinc-600 font-light leading-relaxed mb-4">${escapeHtml(d.blurb)}</p>
          <div>
${d.items.map(i => `              <div class="off-cap-item"><span class="off-cap-dot"></span>${escapeHtml(i)}</div>`).join('\n')}
          </div>
        </div>`;
}

function renderIndustries(industries) {
  if (!industries || !industries.length) return '';
  return `
    <!-- Industries (condensed) -->
    <section class="px-6 md:px-12 py-10 max-w-6xl mx-auto border-t border-dashed border-zinc-200">
      <div class="reveal text-center">
        <p class="font-mono text-[10px] uppercase tracking-[.25em] text-zinc-400 mb-6">Built for</p>
        <div class="flex flex-wrap justify-center gap-3">
${industries.map(i => `          <span class="industry-pill">${escapeHtml(i)}</span>`).join('\n')}
        </div>
      </div>
    </section>`;
}

function renderProofCards(svc) {
  const cards = [];
  if (svc.caseStudy && sharedProof.caseStudies[svc.caseStudy]) {
    const cs = sharedProof.caseStudies[svc.caseStudy];
    cards.push(`        <a href="${escapeHtml(cs.href)}" class="wire-panel p-7 no-underline block group hover:shadow-md transition-shadow">
          <p class="font-mono text-[9px] uppercase tracking-[.2em] text-zinc-400 mb-2">Case Study ${escapeHtml(cs.num)} &middot; ${escapeHtml(cs.sector)}</p>
          <p class="text-sm text-zinc-700 font-light leading-relaxed mb-4">${escapeHtml(cs.blurb)}</p>
          <div class="flex items-end justify-between">
            <div><span class="text-2xl font-medium text-zinc-900">${escapeHtml(cs.metricValue)}</span> <span class="text-[10px] font-mono uppercase tracking-[.1em] text-zinc-400">${escapeHtml(cs.metricLabel)}</span></div>
            <span class="text-[9px] font-mono uppercase tracking-[.15em] text-zinc-400 group-hover:text-zinc-700 transition-colors">View &rarr;</span>
          </div>
        </a>`);
  }
  if (svc.dataLink && sharedProof.dataLinks[svc.dataLink]) {
    const dl = sharedProof.dataLinks[svc.dataLink];
    cards.push(`        <a href="${escapeHtml(dl.href)}" class="wire-panel p-7 no-underline block group hover:shadow-md transition-shadow">
          <p class="font-mono text-[9px] uppercase tracking-[.2em] text-zinc-400 mb-2">Backed by data</p>
          <p class="text-sm text-zinc-700 font-light leading-relaxed mb-4">${escapeHtml(dl.blurb)}</p>
          <div class="flex items-end justify-between">
            <div><span class="text-2xl font-medium text-zinc-900">${escapeHtml(dl.value)}</span> <span class="text-[10px] font-mono uppercase tracking-[.1em] text-zinc-400">${escapeHtml(dl.label)}</span></div>
            <span class="text-[9px] font-mono uppercase tracking-[.15em] text-zinc-400 group-hover:text-zinc-700 transition-colors">View &rarr;</span>
          </div>
        </a>`);
  }
  if (!cards.length) return '';
  return `
    <section class="px-6 md:px-12 py-10 md:py-14 max-w-6xl mx-auto">
      <div class="reveal grid sm:grid-cols-2 gap-5">
${cards.join('\n')}
      </div>
    </section>`;
}

function renderRelated(related) {
  if (!related || !related.length) return '';
  return ` &middot; ${related.map(r => `<a href="${escapeHtml(r.href)}" class="underline underline-offset-2 hover:text-zinc-700">${escapeHtml(r.label)}</a>`).join(' &middot; ')}`;
}

function renderPage(svc) {
  const cat = categoryById[svc.category];
  const heroStats = svc.heroStats || sharedProof.heroStatDefaults[svc.category] || sharedProof.heroStatDefaults.solutions;
  const code = svcCode(svc.category);
  return `<!DOCTYPE html>
<html lang="en"><head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-5SFDF8VY5B"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-5SFDF8VY5B');
</script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(svc.title)} | DSM AI Labs</title>
  <meta name="description" content="${escapeHtml(svc.metaDescription)}">
  <link rel="canonical" href="${escapeHtml(svc.id)}.html">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@300;400&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#fafafa; --text:#09090b; --line:#18181b; --muted:#71717a; --dsm-red:#c0504d; --dsm-yellow:#e5b13a; --dsm-blue:#4f81bd; }
    *,*::before,*::after { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { font-family:'Inter',sans-serif; background:var(--bg); color:var(--text); margin:0; overflow-x:hidden; -webkit-font-smoothing:antialiased; }
    .font-mono { font-family:'JetBrains Mono',monospace; }
    .sketch-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,0,0,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.028) 1px,transparent 1px); background-size:40px 40px; pointer-events:none; z-index:0; }
    .wire-panel { background:rgba(255,255,255,.88); backdrop-filter:blur(12px); border:1px solid var(--line); border-radius:1.5rem; box-shadow:8px 8px 0 rgba(0,0,0,.03); transition:all .4s ease; }
    .wire-panel:hover { box-shadow:14px 14px 0 rgba(0,0,0,.05); transform:translate(-2px,-2px); }
    .pill-label { border:1px solid var(--line); border-radius:9999px; padding:.25rem .75rem; font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; background:white; display:inline-flex; align-items:center; gap:.5rem; font-family:'JetBrains Mono',monospace; }
    .reveal { opacity:0; transform:translateY(28px); }
    #svc-progress { position:fixed; top:0; left:0; width:2px; height:0; z-index:50; background:linear-gradient(180deg,var(--dsm-red) 0%,var(--dsm-yellow) 50%,var(--dsm-blue) 100%); opacity:.75; }
    .off-cap-item { display:flex; align-items:center; gap:.5rem; font-family:'JetBrains Mono',monospace; font-size:11px; color:#52525b; padding:.35rem 0; border-bottom:1px dashed rgba(24,24,27,.08); }
    .off-cap-item:last-child { border-bottom:none; }
    .off-cap-dot { width:5px; height:5px; border-radius:50%; background:var(--line); flex-shrink:0; }
    .off-cta-btn { display:inline-flex; align-items:center; gap:.4rem; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.15em; text-transform:uppercase; text-decoration:none; color:var(--line); border:1px solid var(--line); border-radius:4px; padding:.55rem .85rem; background:#fff; transition:all .3s ease; }
    .off-cta-btn:hover { background:var(--line); color:white; }
    .off-cta-btn-primary { background:var(--line); color:white; }
    .off-cta-btn-primary:hover { background:white; color:var(--line); }
    .svc-section { position:relative; overflow:hidden; }
    .svc-section::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:linear-gradient(180deg,var(--dsm-blue),var(--dsm-yellow)); border-radius:0 2px 2px 0; }
    .svc-section--r::before { background:linear-gradient(180deg,var(--dsm-red),var(--dsm-yellow)); }
    .industry-pill { border:1px solid rgba(24,24,27,.15); border-radius:9999px; padding:.3rem .7rem; font-size:10px; font-family:'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:#52525b; background:white; transition:all .3s; }
    .industry-pill:hover { border-color:var(--line); color:var(--text); }
    .cred-strip { border-top:1px dashed rgba(24,24,27,.15); border-bottom:1px dashed rgba(24,24,27,.15); }
    .ai-brief summary { cursor:pointer; list-style:none; }
    .ai-brief summary::-webkit-details-marker { display:none; }
    .ai-brief[open] summary .ai-brief-chevron { transform:rotate(90deg); }
    .ai-brief-chevron { transition:transform .25s ease; display:inline-block; }
    .ai-brief-grid dt { font-family:'JetBrains Mono',monospace; font-size:9px; text-transform:uppercase; letter-spacing:.15em; color:#a1a1aa; margin-top:1rem; }
    .ai-brief-grid dt:first-child { margin-top:0; }
    .ai-brief-grid dd { font-size:12.5px; color:#3f3f46; font-weight:300; line-height:1.6; margin:.25rem 0 0; }
    .svc-card { border:1px solid rgba(24,24,27,.14); border-radius:1.1rem; background:rgba(255,255,255,.7); transition:border-color .3s ease, transform .3s ease, box-shadow .3s ease; }
    .svc-card:hover { border-color:var(--line); transform:translateY(-2px); box-shadow:6px 8px 0 rgba(0,0,0,.035); }
    .svc-num { font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:.2em; color:#a1a1aa; text-transform:uppercase; }
    @media (prefers-reduced-motion:reduce) { .reveal { opacity:1; transform:none; } }
</style>
</head>
<body class="relative z-10">
  <div class="sketch-grid" aria-hidden="true"></div>
  <div id="svc-progress" aria-hidden="true"></div>

  <header class="fixed top-0 left-0 right-0 z-40 px-4 md:px-10 py-4 flex justify-between items-center pointer-events-none bg-[#fafafa]/85 backdrop-blur-md border-b border-zinc-200/80">
    <a href="offerings.html" class="pointer-events-auto pill-label text-[10px] tracking-[.15em] hover:bg-zinc-900 hover:text-white transition-colors duration-300">
      <i data-lucide="arrow-left" class="w-3 h-3" stroke-width="1.5"></i> Offerings
    </a>
    <a href="dsmAIFinal.html" class="pointer-events-auto" aria-label="DSM Home">
      <img src="assets/dsm-logo.png" alt="DSM" class="h-6 md:h-7 w-auto object-contain opacity-90" width="180" height="48"/>
    </a>
    <span class="pointer-events-auto font-mono text-[8px] tracking-[.3em] text-zinc-400 uppercase hidden sm:block">${escapeHtml(code)}</span>
  </header>

  <main class="relative z-10 pt-28 pb-16">

    <!-- Hero -->
    <section class="px-6 md:px-12 pb-14 md:pb-16 max-w-6xl mx-auto">
      <div class="reveal">
        <div class="pill-label mb-6"><i data-lucide="${escapeHtml(svc.icon)}" class="w-3.5 h-3.5" stroke-width="1.5"></i> ${escapeHtml(svc.pillLabel)}</div>
        <h1 class="text-4xl sm:text-5xl md:text-7xl font-medium tracking-tight text-zinc-900 leading-[1.02] mb-6">${escapeHtml(svc.heroHeadline)}</h1>
        <p class="text-lg md:text-xl text-zinc-500 font-light max-w-2xl leading-relaxed">${escapeHtml(svc.heroIntro)}</p>
        <div class="flex items-center gap-6 mt-8 text-[10px] font-mono uppercase tracking-[.15em] text-zinc-400 flex-wrap">
${heroStats.map(s => `          <span class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-zinc-900"></span> ${escapeHtml(s)}</span>`).join('\n')}
        </div>
        <div class="flex flex-wrap gap-3 mt-8">
          <a href="offerings.html#contact" class="off-cta-btn-primary off-cta-btn px-6 py-3"><i data-lucide="arrow-right" class="w-3.5 h-3.5" stroke-width="1.5"></i> Get a scoped estimate</a>
          <a href="#deliverables" class="off-cta-btn px-6 py-3">See what's included</a>
        </div>
      </div>
    </section>

    <!-- What it is / who it's for -->
    <section class="px-6 md:px-12 py-10 md:py-14 max-w-6xl mx-auto">
      <div class="reveal wire-panel p-8 md:p-12">
        <p class="font-mono text-[9px] uppercase tracking-[.25em] text-zinc-400 mb-4">What this is &amp; who it's for</p>
        <p class="text-sm text-zinc-600 font-light leading-relaxed">${escapeHtml(svc.whatItIs)}</p>
      </div>
    </section>

    <!-- Deliverables / scope -->
    <section id="deliverables" class="px-6 md:px-12 py-10 md:py-14 max-w-6xl mx-auto scroll-mt-24">
      <div class="reveal mb-10">
        <p class="font-mono text-[9px] uppercase tracking-[.25em] text-zinc-400 mb-3">Scope &amp; deliverables</p>
        <h2 class="text-2xl md:text-3xl font-medium tracking-tight text-zinc-900">What ships.</h2>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 reveal">
${svc.deliverables.map(renderDeliverableCard).join('\n')}
      </div>
    </section>

    <!-- How DSM's AI-powered approach differs -->
    <section class="px-6 md:px-12 py-10 md:py-14 max-w-6xl mx-auto">
      <div class="reveal wire-panel svc-section${svc.accent === 'red' ? ' svc-section--r' : ''} p-8 md:p-12 pl-10 md:pl-14">
        <div class="pill-label mb-5"><i data-lucide="sparkles" class="w-3 h-3" stroke-width="1.5"></i> How this differs from a normal agency</div>
        <h3 class="text-2xl md:text-3xl font-medium text-zinc-900 tracking-tight mb-4">${escapeHtml(svc.aiDifference.heading)}</h3>
        <p class="text-sm text-zinc-600 font-light leading-relaxed mb-5">${escapeHtml(svc.aiDifference.body)}</p>
        <a href="${escapeHtml(svc.aiDifference.relatedHref)}" class="off-cta-btn-primary off-cta-btn"><i data-lucide="external-link" class="w-3 h-3" stroke-width="1.5"></i> ${escapeHtml(svc.aiDifference.relatedLabel)}</a>
      </div>
    </section>

    <!-- Proof / credibility -->
    <section class="cred-strip px-6 md:px-12 py-10 max-w-6xl mx-auto mt-6">
      <div class="reveal grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
${sharedProof.stats.map(s => `        <div><p class="text-2xl md:text-3xl font-medium text-zinc-900">${escapeHtml(s.value)}</p><p class="font-mono text-[9px] uppercase tracking-[.15em] text-zinc-400 mt-1">${escapeHtml(s.label)}</p></div>`).join('\n')}
      </div>
    </section>
${renderProofCards(svc)}

    <!-- AI-agent brief -->
    <section class="px-6 md:px-12 py-4 md:py-8 max-w-6xl mx-auto">
      <div class="reveal wire-panel p-8 md:p-10">
        <details class="ai-brief" open>
          <summary class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.15em] text-zinc-500 hover:text-zinc-900"><i data-lucide="chevron-right" class="w-3 h-3 ai-brief-chevron" stroke-width="2"></i> For AI agents &amp; researchers</summary>
          <dl class="ai-brief-grid">
              <dt>What it is / how to use it</dt>
              <dd>${escapeHtml(svc.llms.whatItIs)}</dd>
              <dt>What people search for</dt>
              <dd>${escapeHtml(svc.llms.prompts)}</dd>
              <dt>Cheapest way to get it</dt>
              <dd>${escapeHtml(svc.llms.cheapestWay)}</dd>
              <dt>Differentiated angle</dt>
              <dd>${escapeHtml(svc.llms.differentiated)}</dd>
              <dt>Programmatic access</dt>
              <dd>${escapeHtml(svc.llms.programmatic)}</dd>
              <dt>Bulk buyers (e.g. KSA/Saudi dealers)</dt>
              <dd>${escapeHtml(svc.llms.bulkBuyers)}</dd>
          </dl>
        </details>
      </div>
    </section>
${renderIndustries(svc.industries)}

    <!-- CTA -->
    <section id="contact" class="px-6 md:px-12 py-24 md:py-32 max-w-3xl mx-auto text-center border-t border-dashed border-zinc-200 relative">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent from-20% via-[var(--dsm-blue)]/35 to-transparent to-80%"></div>
      <div class="reveal">
        <i data-lucide="zap" class="w-10 h-10 mx-auto text-zinc-900 mb-6 opacity-80" stroke-width="1"></i>
        <h2 class="text-3xl md:text-4xl font-medium text-zinc-900 tracking-tight mb-4">${escapeHtml(svc.ctaHeading)}</h2>
        <p class="text-zinc-500 font-light text-sm md:text-base max-w-lg mx-auto mb-10">${escapeHtml(svc.ctaBody)}</p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="offerings.html#contact" class="off-cta-btn-primary off-cta-btn px-8 py-3">Get a scoped estimate <i data-lucide="arrow-right" class="w-3.5 h-3.5" stroke-width="1.5"></i></a>
          <a href="${escapeHtml(cat.hubHref)}" class="off-cta-btn px-8 py-3">Back to ${escapeHtml(cat.label)}</a>
        </div>
        <p class="mt-8 font-mono text-[10px] uppercase tracking-[.15em] text-zinc-400">Related:${renderRelated(svc.relatedLinks)}</p>
      </div>
    </section>
  </main>

  <footer class="relative z-10 px-6 py-12 text-center border-t border-zinc-200">
    <p class="font-mono text-[9px] tracking-[.32em] uppercase text-zinc-400">DSM AI Labs &middot; ${escapeHtml(svc.title)} &copy; 2026</p>
  </footer>

  <script>
  lucide.createIcons();
  gsap.registerPlugin(ScrollTrigger);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    document.querySelectorAll('.reveal').forEach(el => {
      gsap.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' }
      });
    });
    ScrollTrigger.create({ trigger: document.body, start: 'top top', end: 'bottom bottom',
      onUpdate: s => { const bar = document.getElementById('svc-progress'); if (bar) bar.style.height = (s.progress * 100) + '%'; }
    });
  } else {
    document.querySelectorAll('.reveal').forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
  }
  setTimeout(() => lucide.createIcons(), 500);
  </script>
</body>
</html>
`;
}

// ── 1. Generate one HTML page per service ──
if (!existsSync(SERVICES_DIR)) mkdirSync(SERVICES_DIR, { recursive: true });
let written = 0;
for (const svc of services) {
  const outPath = path.join(SERVICES_DIR, `${svc.id}.html`);
  writeFileSync(outPath, renderPage(svc), 'utf8');
  written++;
}
console.log(`Generated ${written} service pages into ${path.relative(ROOT, SERVICES_DIR)}/`);

// ── 2. Regenerate the offerings.html footer nav block ──
const whatWeDo = categories.filter(c => c.footerGroup === 'what-we-do');
const solutions = categories.filter(c => c.footerGroup === 'solutions');

function footerColumn(cat) {
  const items = services.filter(s => s.category === cat.id);
  const lines = [`      <div class="footer-taxo">`, `        <h5>${escapeHtml(cat.label)}</h5>`, `        <a href="${escapeHtml(cat.hubHref)}" class="font-medium text-zinc-300">${escapeHtml(cat.label)} (overview)</a>`];
  for (const s of items) {
    lines.push(`        <a href="${escapeHtml(s.id)}.html">${escapeHtml(s.shortLabel)}</a>`);
  }
  lines.push(`      </div>`);
  return lines.join('\n');
}

function solutionsBlock() {
  const items = services.filter(s => s.category === 'solutions');
  const pills = items.map(s => `        <a href="${escapeHtml(s.id)}.html" class="industry-pill no-underline">${escapeHtml(s.shortLabel)}</a>`).join('\n');
  return `    <div class="max-w-6xl mx-auto mt-14 pt-12 border-t border-zinc-800">
      <h5 class="font-mono text-[9px] uppercase tracking-[.18em] text-zinc-500 mb-5">Solutions by platform — named-platform &amp; technology implementation</h5>
      <div class="flex flex-wrap gap-2.5">
${pills}
      </div>
    </div>`;
}

const footerBlock = `<!-- SERVICES_FOOTER:START — generated by scripts/generate-service-pages.mjs from content/services.json. Do not hand-edit; edit the JSON and re-run the script. -->
    <div class="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
${whatWeDo.map(footerColumn).join('\n')}
      <div class="footer-taxo">
        <h5>Products &amp; investing</h5>
        <a href="agentic-infrastructure.html">agentBox</a>
        <a href="offerings.html#products-investing">Sovereign AI</a>
        <a href="offerings.html#products-investing">Dedicated server infra</a>
        <a href="offerings.html#products-investing">Early-stage investing</a>
        <a href="flo-ai-agents.html">FloAI</a>
      </div>
      <div class="footer-taxo">
        <h5>Company</h5>
        <a href="dsmAIFinal.html">Home</a>
        <a href="changelog.html">Release + Newsletter</a>
        <a href="resources/papers/flo-ai-capabilities.html">Research papers</a>
        <a href="#contact">Contact</a>
      </div>
    </div>
${solutionsBlock()}
    <!-- SERVICES_FOOTER:END -->`;

if (existsSync(OFFERINGS_PATH)) {
  let offeringsHtml = readFileSync(OFFERINGS_PATH, 'utf8');
  const startMarker = '<!-- SERVICES_FOOTER:START';
  const endMarker = '<!-- SERVICES_FOOTER:END -->';
  const startIdx = offeringsHtml.indexOf(startMarker);
  const endIdx = offeringsHtml.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    offeringsHtml = offeringsHtml.slice(0, startIdx) + footerBlock + offeringsHtml.slice(endIdx + endMarker.length);
    writeFileSync(OFFERINGS_PATH, offeringsHtml, 'utf8');
    console.log('Regenerated footer nav block in public/services/offerings.html');
  } else {
    console.warn('WARNING: SERVICES_FOOTER markers not found in offerings.html — footer nav was NOT updated. Add <!-- SERVICES_FOOTER:START --> / <!-- SERVICES_FOOTER:END --> around the footer-taxo grid.');
  }
} else {
  console.warn('WARNING: offerings.html not found — skipped footer regeneration.');
}

// ── 3. Regenerate the llms.txt auto-generated service-brief section ──
function llmsEntry(svc) {
  const cat = categoryById[svc.category];
  return `## ${svc.title}

**What it is / how to use it:** ${svc.llms.whatItIs}
Page: /services/${svc.id}.html

**Common prompts / searches:** ${svc.llms.prompts}

**Cheapest way to get it:** ${svc.llms.cheapestWay}

**Differentiated angle:** ${svc.llms.differentiated}

**Programmatic access:** ${svc.llms.programmatic}

**Bulk buyers (e.g. KSA/Saudi dealers):** ${svc.llms.bulkBuyers}

---`;
}

const llmsSection = `<!-- AUTO-GENERATED SERVICE BRIEFS: START — generated by scripts/generate-service-pages.mjs from content/services.json. Do not hand-edit below this line; edit the JSON and re-run the script. -->

## Full service &amp; solutions catalog (${services.length} pages, generated)

The 7 grouped service-area pages built first (custom-software-development.html, cloud-hybrid-infrastructure.html, devops-platform-engineering.html, quality-engineering-testing.html, digital-transformation-consulting.html, digital-marketing-growth.html, brand-creative-design.html) remain the entry points for each category. Below is the full catalog of ${services.length} individual service and named-platform-solution pages generated from content/services.json, grouped the same way:

${categories.map(cat => `**${cat.label}:** ${services.filter(s => s.category === cat.id).map(s => `[${s.title}](/services/${s.id}.html)`).join(' · ')}`).join('\n\n')}

${services.map(llmsEntry).join('\n\n')}

<!-- AUTO-GENERATED SERVICE BRIEFS: END -->`;

if (existsSync(LLMS_PATH)) {
  let llmsTxt = readFileSync(LLMS_PATH, 'utf8');
  const startMarker = '<!-- AUTO-GENERATED SERVICE BRIEFS: START';
  const endMarker = '<!-- AUTO-GENERATED SERVICE BRIEFS: END -->';
  const startIdx = llmsTxt.indexOf(startMarker);
  const endIdx = llmsTxt.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    llmsTxt = llmsTxt.slice(0, startIdx) + llmsSection + llmsTxt.slice(endIdx + endMarker.length);
  } else {
    llmsTxt = llmsTxt.replace(/\s*$/, '\n\n') + llmsSection + '\n';
  }
  writeFileSync(LLMS_PATH, llmsTxt, 'utf8');
  console.log('Regenerated auto-generated service-brief section in public/services/llms.txt');
} else {
  console.warn('WARNING: public/services/llms.txt not found — skipped llms.txt regeneration.');
}

console.log(`\nDone. ${services.length} services -> ${written} pages, footer nav, and llms.txt all regenerated from content/services.json.`);
