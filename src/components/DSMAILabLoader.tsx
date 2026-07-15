import { useRef, useEffect, useState, useCallback } from 'react';

interface DSMAILabLoaderProps {
  onLoadComplete: () => void;
  isContentReady: boolean;
}

const LOADER_HTML = `<!DOCTYPE html>
<html lang="en"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DSM AI Lab — Engineering Boot</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <script src="https://unpkg.com/lucide@latest"><\/script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@100;300;400&display=swap" rel="stylesheet">

    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
            }
        }
    <\/script>

    <style>
        :root {
            --bg:#fafafa;
            --text:#09090b;
            --muted:#71717a;
            --line:#18181b;
            --dsm-red:#c0504d;
            --dsm-yellow:#e5b13a;
            --dsm-blue:#4f81bd;
        }
        *,*::before,*::after { box-sizing:border-box; }
        body {
            font-family:'Inter', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
        }
        .font-mono { font-family:'JetBrains Mono', monospace; }

        /* Sketch grid background — matches dsmAIFinal */
        .sketch-grid {
            position: fixed; inset: 0;
            background-image:
                linear-gradient(rgba(0,0,0,.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,0,0,.04) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
            z-index: 1;
        }

        /* Soft radial vignette to focus on the center */
        .sketch-vignette {
            position: fixed; inset: 0;
            background:
                radial-gradient(ellipse at center, rgba(255,255,255,0) 35%, rgba(0,0,0,.06) 100%);
            pointer-events: none;
            z-index: 1;
        }

        #canvas-container {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 2;
        }

        #css2d-container {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 3;
            pointer-events: none;
        }

        /* Corner brackets — engineering viewfinder */
        .corner {
            position: fixed;
            width: 36px; height: 36px;
            border: 1px solid var(--line);
            z-index: 5;
            pointer-events: none;
        }
        .corner.tl { top: 24px; left: 24px; border-right: 0; border-bottom: 0; }
        .corner.tr { top: 24px; right: 24px; border-left: 0; border-bottom: 0; }
        .corner.bl { bottom: 24px; left: 24px; border-right: 0; border-top: 0; }
        .corner.br { bottom: 24px; right: 24px; border-left: 0; border-top: 0; }

        /* Top REC bar */
        .top-bar {
            position: fixed;
            top: 28px; left: 0; right: 0;
            display: flex; justify-content: center; align-items: center;
            gap: 1.5rem;
            z-index: 5;
            pointer-events: none;
        }
        .rec-pill {
            display: inline-flex; align-items: center; gap: .55rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
            color: #18181b;
            padding: .35rem .8rem;
            background: rgba(255,255,255,.85);
            border: 1px solid var(--line);
            border-radius: 9999px;
            backdrop-filter: blur(6px);
        }
        .rec-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--dsm-red);
            box-shadow: 0 0 0 0 rgba(192,80,77,.6);
            animation: recPulse 2s infinite;
        }
        @keyframes recPulse {
            0% { box-shadow: 0 0 0 0 rgba(192,80,77,.6); }
            70% { box-shadow: 0 0 0 10px rgba(192,80,77,0); }
            100% { box-shadow: 0 0 0 0 rgba(192,80,77,0); }
        }

        /* Bottom UI */
        .bottom-ui {
            position: fixed;
            left: 0; right: 0; bottom: 48px;
            display: flex; flex-direction: column; align-items: center;
            gap: 1.25rem;
            z-index: 5;
            pointer-events: none;
        }
        .brand-strip {
            display: flex; align-items: center; justify-content: space-between;
            gap: 1.25rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px; letter-spacing: .3em; text-transform: uppercase;
            color: #52525b;
            min-width: 320px;
            padding: 0 .25rem;
        }
        .brand-strip .sep { color: rgba(0,0,0,.18); font-weight: 300; }
        .brand-strip span:not(.sep) { animation: brandPulse 2.2s ease-in-out infinite; }
        .brand-strip span:nth-of-type(3):not(.sep) { animation-delay: .2s; }
        .brand-strip span:nth-of-type(5):not(.sep) { animation-delay: .4s; }
        @keyframes brandPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .55; }
        }

        .phrase-pill {
            display: inline-flex; align-items: center; gap: .65rem;
            padding: .55rem 1rem;
            background: rgba(255,255,255,.9);
            border: 1px solid var(--line);
            border-radius: 9999px;
            box-shadow: 4px 4px 0 rgba(0,0,0,.04);
            backdrop-filter: blur(8px);
        }
        .phrase-pill .spinner {
            width: 14px; height: 14px;
            border: 1.5px solid rgba(24,24,27,.15);
            border-top-color: var(--dsm-red);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        #loading-phrase {
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
            color: #27272a;
            transition: opacity .3s ease;
        }

        /* Progress bar */
        .progress-track {
            width: min(60%, 480px);
            height: 1px;
            background: rgba(24,24,27,.12);
            position: relative;
            overflow: hidden;
        }
        .progress-fill {
            position: absolute; left: 0; top: 0; bottom: 0;
            background: var(--dsm-red);
            width: 0%;
            transition: width .3s ease;
        }

        /* Top-left meta */
        .meta-left {
            position: fixed;
            top: 80px; left: 32px;
            z-index: 5; pointer-events: none;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
            color: #52525b;
            line-height: 1.8;
        }
        .meta-left .accent { color: var(--dsm-red); }

        .meta-right {
            position: fixed;
            top: 80px; right: 32px;
            z-index: 5; pointer-events: none;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
            color: #52525b;
            text-align: right;
            line-height: 1.8;
        }

        @media (max-width: 700px) {
            .meta-left, .meta-right { display: none; }
            .corner { width: 24px; height: 24px; }
        }
    </style>
</head>
<body>

    <div class="sketch-grid"></div>
    <div class="sketch-vignette"></div>

    <!-- Corner brackets -->
    <div class="corner tl"></div>
    <div class="corner tr"></div>
    <div class="corner bl"></div>
    <div class="corner br"></div>

    <!-- Top REC indicator -->
    <div class="top-bar">
        <div class="rec-pill"><span class="rec-dot"></span>REC · DSM AI LAB</div>
    </div>

    <!-- Top metadata -->
    <div class="meta-left">
        ENG_BOOT · 001<br>
        <span class="accent">SYSTEM</span> · ENGINEERED
    </div>
    <div class="meta-right">
        DUBAI · UAE<br>
        AI-NATIVE · SERVICES
    </div>

    <div id="canvas-container"></div>
    <div id="css2d-container"></div>

    <!-- Bottom UI -->
    <div class="bottom-ui">
        <div class="brand-strip">
            <span>DIGITAL</span>
            <span class="sep">/</span>
            <span>SOFTWARE</span>
            <span class="sep">/</span>
            <span>MARKET</span>
        </div>

        <div class="phrase-pill">
            <span class="spinner"></span>
            <span id="loading-phrase">Calibrating engineered systems...</span>
        </div>

        <div class="progress-track">
            <div class="progress-fill" id="progress-fill"></div>
        </div>
    </div>

    <!-- 3D Engine -->
    <script type="module">
        import * as THREE from 'three';
        import { FontLoader } from 'three/addons/loaders/FontLoader.js';
        import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
        import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

        const container = document.getElementById('canvas-container');
        const css2dContainer = document.getElementById('css2d-container');

        const scene = new THREE.Scene();
        scene.background = null;

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 4, 18);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.localClippingEnabled = true;
        container.appendChild(renderer.domElement);

        const labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        css2dContainer.appendChild(labelRenderer.domElement);

        // Lighting tuned for light background
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

        const frontLight = new THREE.DirectionalLight(0xffffff, 1.4);
        frontLight.position.set(2, 5, 10);
        scene.add(frontLight);

        const topLight = new THREE.DirectionalLight(0xffffff, 0.9);
        topLight.position.set(0, 10, 0);
        scene.add(topLight);

        const rimLight = new THREE.DirectionalLight(0xd6d6d6, 0.6);
        rimLight.position.set(-6, 2, -4);
        scene.add(rimLight);

        // Logo group
        const logoGroup = new THREE.Group();
        scene.add(logoGroup);
        logoGroup.rotation.x = -0.1;
        logoGroup.rotation.y = 0.05;

        let currentFillY = -3.0;
        const fillPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), currentFillY);

        // Sketch-theme brand palette
        const cInk = 0x18181b;        // near-black for text fill
        const cRed = 0xc0504d;
        const cYellow = 0xe5b13a;
        const cBlue = 0x4f81bd;
        const cWire = 0x18181b;       // dark wireframe (visible on white)

        let fillCompleteCount = 0;

        const fontLoader = new FontLoader();
        fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', function (font) {

            const textGeo = new TextGeometry('DSM', {
                font: font,
                size: 3.5,
                height: 0.8,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.04,
                bevelSize: 0.04,
                bevelOffset: 0,
                bevelSegments: 3
            });

            textGeo.computeBoundingBox();
            const bb = textGeo.boundingBox;
            const tW = bb.max.x - bb.min.x;
            const tH = bb.max.y - bb.min.y;

            textGeo.translate(-bb.min.x, -bb.min.y, -0.4);

            const dsmAssembly = new THREE.Group();

            // Dark wireframe shell (hand-sketched look on white)
            const wireMatText = new THREE.MeshBasicMaterial({
                color: cWire, wireframe: true, transparent: true, opacity: 0.55
            });
            // Ink fill clipped by fill plane
            const fillMatText = new THREE.MeshStandardMaterial({
                color: cInk, roughness: 0.55, metalness: 0.1,
                clippingPlanes: [fillPlane], side: THREE.DoubleSide
            });

            dsmAssembly.add(new THREE.Mesh(textGeo, wireMatText));
            dsmAssembly.add(new THREE.Mesh(textGeo, fillMatText));

            // Three brand-color boxes (sketch wire + filled inside)
            const boxSize = tH * 0.30;
            const gap = tH * 0.05;
            const boxW = boxSize * 1.25;
            const boxD = 0.8;

            const boxGeo = new THREE.BoxGeometry(boxW, boxSize, boxD);

            const bX = tW + (tH * 0.12) + (boxW / 2);
            const midY = tH / 2;
            const topY = midY + boxSize + gap;
            const botY = midY - boxSize - gap;

            const createColorBox = (y, color) => {
                const wireMat = new THREE.MeshBasicMaterial({
                    color: color, wireframe: true, transparent: true, opacity: 0.85
                });
                const fillMat = new THREE.MeshStandardMaterial({
                    color: color, roughness: 0.4, metalness: 0.25,
                    clippingPlanes: [fillPlane]
                });

                const wireMesh = new THREE.Mesh(boxGeo, wireMat);
                const fillMesh = new THREE.Mesh(boxGeo, fillMat);

                wireMesh.position.set(bX, y, 0);
                fillMesh.position.set(bX, y, 0);

                dsmAssembly.add(wireMesh);
                dsmAssembly.add(fillMesh);
            };

            createColorBox(topY, cRed);
            createColorBox(midY, cYellow);
            createColorBox(botY, cBlue);

            const totalWidth = bX + (boxW / 2);
            dsmAssembly.position.x = -totalWidth / 2;
            dsmAssembly.position.y = -tH / 2;

            logoGroup.add(dsmAssembly);

            // Subtle inner glow (warm, light-friendly)
            const innerGlow = new THREE.PointLight(0xfff4d6, 1.4, 14);
            innerGlow.position.set(0, currentFillY, 0);
            logoGroup.add(innerGlow);
            window.innerGlowLight = innerGlow;
        });

        // Tech particles — falling stack labels with sketch-style chips
        const techStacks = [
            "FloAgent", "RealmAI", "TaaS", "Voice AI",
            "Agents", "LLM Ops", "Pipelines", "RAG",
            "Edge", "Vision", "ETL", "Eval"
        ];
        const particleColors = [cRed, cYellow, cBlue, 0x27272a];
        const geometries = [
            new THREE.IcosahedronGeometry(0.4, 0),
            new THREE.BoxGeometry(0.6, 0.6, 0.6),
            new THREE.TetrahedronGeometry(0.5, 0)
        ];

        const activeParticles = [];
        let targetFillY = -3.0;
        const maxFillY = 3.0;

        function spawnParticle() {
            if (activeParticles.length > 6) return;

            const techName = techStacks[Math.floor(Math.random() * techStacks.length)];
            const geo = geometries[Math.floor(Math.random() * geometries.length)];
            const pColor = particleColors[Math.floor(Math.random() * particleColors.length)];

            const mat = new THREE.MeshStandardMaterial({
                color: pColor, emissive: pColor, emissiveIntensity: 0.15,
                transparent: true, opacity: 0.95, metalness: 0.35, roughness: 0.4
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((Math.random() - 0.5) * 8, 10 + Math.random() * 2, (Math.random() - 0.5) * 2);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

            // Sketch-style chip label (light theme)
            const labelDiv = document.createElement('div');
            labelDiv.style.cssText = [
                "display:flex","align-items:center","gap:.5rem",
                "padding:.25rem .65rem","border-radius:9999px",
                "background:rgba(255,255,255,.92)",
                "border:1px solid #18181b",
                "color:#18181b","font-family:'JetBrains Mono', monospace",
                "font-size:10px","letter-spacing:.18em","text-transform:uppercase",
                "box-shadow:3px 3px 0 rgba(0,0,0,.05)",
                "backdrop-filter:blur(4px)",
                "opacity:0","transform:translateY(8px)",
                "transition:opacity .5s ease, transform .5s ease"
            ].join(';');

            const dot = document.createElement('div');
            const colorHex = '#' + pColor.toString(16).padStart(6, '0');
            dot.style.cssText = \`width:6px;height:6px;border-radius:50%;background:\${colorHex};box-shadow:0 0 6px \${colorHex}66;\`;

            const textSpan = document.createElement('span');
            textSpan.textContent = techName;

            labelDiv.appendChild(dot);
            labelDiv.appendChild(textSpan);

            const label = new CSS2DObject(labelDiv);
            label.position.set(0, 1.0, 0);
            mesh.add(label);

            scene.add(mesh);

            activeParticles.push({
                mesh: mesh,
                labelDiv: labelDiv,
                speed: 0.08 + Math.random() * 0.05,
                rotSpeedX: (Math.random() - 0.5) * 0.1,
                rotSpeedY: (Math.random() - 0.5) * 0.1
            });

            setTimeout(() => {
                labelDiv.style.opacity = '1';
                labelDiv.style.transform = 'translateY(0)';
            }, 50);
        }

        setInterval(spawnParticle, 250);

        // Progress bar visualization
        const progressEl = document.getElementById('progress-fill');
        function updateProgress() {
            const pct = Math.max(0, Math.min(100, ((currentFillY + 3.0) / 6.0) * 100));
            if (progressEl) progressEl.style.width = pct + '%';
        }

        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);
            const time = clock.getElapsedTime();

            logoGroup.rotation.y = 0.05 + Math.sin(time * 0.4) * 0.06;
            logoGroup.position.y = Math.sin(time * 0.8) * 0.1;

            for (let i = activeParticles.length - 1; i >= 0; i--) {
                const p = activeParticles[i];
                p.mesh.position.y -= p.speed;
                p.mesh.rotation.x += p.rotSpeedX;
                p.mesh.rotation.y += p.rotSpeedY;

                if (p.mesh.position.y <= currentFillY + 0.5) {
                    p.labelDiv.style.opacity = '0';
                    p.labelDiv.style.transform = 'translateY(-6px)';

                    setTimeout(((meshToRemove) => {
                        return () => scene.remove(meshToRemove);
                    })(p.mesh), 300);

                    activeParticles.splice(i, 1);

                    targetFillY += 0.5;
                    if (targetFillY > maxFillY) {
                        fillCompleteCount++;
                        window.parent.postMessage({ type: 'DSM_AI_LOADER_FILL_COMPLETE', count: fillCompleteCount }, '*');
                        targetFillY = -3.0;
                        currentFillY = -3.0;
                    }
                }
            }

            currentFillY += (targetFillY - currentFillY) * 0.06;
            fillPlane.constant = currentFillY;
            updateProgress();

            if (window.innerGlowLight) {
                window.innerGlowLight.position.y = currentFillY;
                window.innerGlowLight.intensity = 1.2 + Math.sin(time * 6) * 0.5;
            }

            renderer.render(scene, camera);
            labelRenderer.render(scene, camera);
        }

        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            labelRenderer.setSize(window.innerWidth, window.innerHeight);
        }, false);
    <\/script>

    <!-- Loading phrases — engineering/AI lab themed -->
    <script>
        const loadingPhrases = [
            "Calibrating engineered systems...",
            "Booting FloAgent decks...",
            "Wiring voice AI pipelines...",
            "Drafting blueprints in graphite...",
            "Sketching system architecture...",
            "Tuning RealmAI inference cores...",
            "Plotting delivery framework...",
            "Compiling AI-native workflows...",
            "Surveying the engineering field...",
            "Threading agents through the stack..."
        ];

        let currentIndex = 0;

        function cyclePhrase() {
            const el = document.getElementById('loading-phrase');
            if (!el) return;

            el.style.opacity = '0';

            setTimeout(() => {
                currentIndex = (currentIndex + 1) % loadingPhrases.length;
                el.textContent = loadingPhrases[currentIndex];
                el.style.opacity = '1';
            }, 300);
        }

        setInterval(cyclePhrase, 1500);
    <\/script>

</body></html>`;

const DSMAILabLoader = ({ onLoadComplete, isContentReady }: DSMAILabLoaderProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const fillCompleteRef = useRef(false);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    const blob = new Blob([LOADER_HTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setBlobUrl(url);

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const triggerComplete = useCallback(() => {
    if (hasTriggeredRef.current) return;
    if (isContentReady && fillCompleteRef.current) {
      hasTriggeredRef.current = true;
      setIsFadingOut(true);
      setTimeout(() => {
        onLoadComplete();
      }, 800);
    }
  }, [isContentReady, onLoadComplete]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DSM_AI_LOADER_FILL_COMPLETE') {
        fillCompleteRef.current = true;
        triggerComplete();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [triggerComplete]);

  useEffect(() => {
    if (isContentReady && fillCompleteRef.current) {
      triggerComplete();
    }
  }, [isContentReady, triggerComplete]);

  // AL2: hard cap the boot animation. Regardless of the 3D fill / CDN state,
  // force completion so the total boot stays within the ≤2s budget
  // (1200ms cap + 800ms fade = 2000ms). This also covers slow/blocked CDNs.
  useEffect(() => {
    const cap = setTimeout(() => {
      if (hasTriggeredRef.current) return;
      hasTriggeredRef.current = true;
      fillCompleteRef.current = true;
      setIsFadingOut(true);
      setTimeout(() => onLoadComplete(), 800);
    }, 1200);
    return () => clearTimeout(cap);
  }, [onLoadComplete]);

  if (!blobUrl) return null;

  return (
    <div
      className={`fixed inset-0 z-[10000] transition-opacity ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ transitionDuration: '800ms' }}
    >
      <iframe
        ref={iframeRef}
        src={blobUrl}
        title="DSM AI Lab Loading"
        className="w-full h-full border-0"
        style={{
          width: '100vw',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
        }}
      />
    </div>
  );
};

export default DSMAILabLoader;
