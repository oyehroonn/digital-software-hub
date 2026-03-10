import { useRef, useEffect, useState, useCallback } from 'react';

interface DSMLoaderProps {
  onLoadComplete: () => void;
  isContentReady: boolean;
}

const LOADER_HTML = `<!DOCTYPE html>
<html lang="en" class="dark"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DSM - 3D Hologram Loading</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <script src="https://unpkg.com/lucide@latest"><\/script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
            }
        }
    <\/script>

    <style>
        body {
            font-family: 'Inter', sans-serif;
            background-color: #09090b;
            margin: 0;
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
        }

        #canvas-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        }

        #css2d-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 2;
            pointer-events: none;
        }
    </style>
</head>
<body class="min-h-screen selection:bg-zinc-800 text-zinc-100">

    <!-- Ambient Grid Background -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)] pointer-events-none z-0"></div>

    <div id="canvas-container"></div>
    <div id="css2d-container"></div>

    <!-- Foreground UI Layer -->
    <div class="absolute inset-x-0 bottom-12 flex flex-col items-center justify-end z-10 pointer-events-none">
        <div class="flex flex-col items-center gap-8 w-full max-w-lg px-6">
            
            <!-- Full Brand Name matching the image layout -->
            <div class="flex items-center justify-between w-full text-zinc-400 text-xs md:text-sm tracking-[0.3em] font-normal px-4 md:px-8">
                <span class="animate-pulse">DIGITAL</span>
                <span class="text-zinc-700 font-light text-xs">|</span>
                <span class="animate-pulse" style="animation-delay: 0.2s">SOFTWARE</span>
                <span class="text-zinc-700 font-light text-xs">|</span>
                <span class="animate-pulse" style="animation-delay: 0.4s">MARKET</span>
            </div>

            <!-- System Status with Dynamic Loading Phrases -->
            <div class="flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md shadow-2xl">
                <i data-lucide="loader-2" class="text-zinc-400 w-4 h-4 animate-spin" stroke-width="1.5"></i>
                <span id="loading-phrase" class="text-xs font-normal text-zinc-300 tracking-wide" style="transition: opacity 0.3s ease;">
                    Compiling your creative dreams...
                </span>
            </div>
        </div>
    </div>

    <!-- 3D Engine Script -->
    <script type="module">
        import * as THREE from 'three';
        import { FontLoader } from 'three/addons/loaders/FontLoader.js';
        import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
        import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

        // Initialize Lucide Icons
        lucide.createIcons();

        // --- SCENE SETUP ---
        const container = document.getElementById('canvas-container');
        const css2dContainer = document.getElementById('css2d-container');

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x09090b, 0.025);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 4, 18);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.localClippingEnabled = true; 
        container.appendChild(renderer.domElement);

        const labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        css2dContainer.appendChild(labelRenderer.domElement);

        // --- LIGHTING ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        const frontLight = new THREE.DirectionalLight(0xffffff, 2);
        frontLight.position.set(2, 5, 10);
        scene.add(frontLight);

        const topLight = new THREE.DirectionalLight(0xffffff, 1.5);
        topLight.position.set(0, 10, 0);
        scene.add(topLight);

        // --- HOLOGRAPHIC LOGO ASSEMBLY ---
        const logoGroup = new THREE.Group();
        scene.add(logoGroup);
        
        logoGroup.rotation.x = -0.1;
        logoGroup.rotation.y = 0.05;

        // The clipping plane controls the "fill" level.
        let currentFillY = -3.0; 
        const fillPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), currentFillY);

        // Brand Colors from Original Logo
        const cBlack = 0x0a0a0a;
        const cRed = 0xc64a38;
        const cYellow = 0xd6a62f;
        const cBlue = 0x4b85b9;
        const cWire = 0xffffff;

        // Track fill completion for parent communication
        let fillCompleteCount = 0;

        const loader = new FontLoader();
        loader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', function (font) {
            
            // 1. Create DSM Text Geometry
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

            // Translate text so bottom-left is exactly at (0,0,0) for easier math
            textGeo.translate(-bb.min.x, -bb.min.y, -0.4); 

            const dsmAssembly = new THREE.Group();

            // Text Materials (Black fill, subtle white wireframe)
            const wireMatText = new THREE.MeshBasicMaterial({ color: cWire, wireframe: true, transparent: true, opacity: 0.2 });
            const fillMatText = new THREE.MeshStandardMaterial({
                color: cBlack, roughness: 0.3, metalness: 0.7, clippingPlanes: [fillPlane], side: THREE.DoubleSide
            });

            dsmAssembly.add(new THREE.Mesh(textGeo, wireMatText));
            dsmAssembly.add(new THREE.Mesh(textGeo, fillMatText));

            // 2. Create the Three Color Boxes
            const boxSize = tH * 0.30;
            const gap = tH * 0.05;
            const boxW = boxSize * 1.25;
            const boxD = 0.8;

            const boxGeo = new THREE.BoxGeometry(boxW, boxSize, boxD);

            // Positioning for boxes
            const bX = tW + (tH * 0.12) + (boxW / 2);
            const midY = tH / 2;
            const topY = midY + boxSize + gap;
            const botY = midY - boxSize - gap;

            const createColorBox = (y, color) => {
                const wireMat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.35 });
                const fillMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.4, clippingPlanes: [fillPlane] });
                
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

            // 3. Center the entire assembly
            const totalWidth = bX + (boxW / 2);
            dsmAssembly.position.x = -totalWidth / 2;
            dsmAssembly.position.y = -tH / 2;

            logoGroup.add(dsmAssembly);
            
            // Sync an internal soft glow with the fill level
            const innerGlow = new THREE.PointLight(0xffffff, 2, 12);
            innerGlow.position.set(0, currentFillY, 0);
            logoGroup.add(innerGlow);
            window.innerGlowLight = innerGlow;
        });

        // --- DYNAMIC PARTICLES ---
        const techStacks = ["AutoCAD", "MS Office", "Salesforce", "Hubspot", "Cloud", "Blender", "Three.js", "Framer", "AI", "React"];
        const particleColors = [cRed, cYellow, cBlue, 0x888888];
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
                color: pColor, emissive: pColor, emissiveIntensity: 0.3,
                transparent: true, opacity: 0.9, metalness: 0.5, roughness: 0.2
            });
            
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((Math.random() - 0.5) * 8, 10 + Math.random() * 2, (Math.random() - 0.5) * 2);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

            // Tailwind CSS2D Label
            const labelDiv = document.createElement('div');
            labelDiv.className = 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-950/90 border border-zinc-800/80 text-zinc-300 text-xs font-normal backdrop-blur-md shadow-xl opacity-0 translate-y-3 transition-all duration-500 ease-out';
            
            const dot = document.createElement('div');
            const colorHex = '#' + pColor.toString(16).padStart(6, '0');
            dot.className = 'w-1.5 h-1.5 rounded-full';
            dot.style.backgroundColor = colorHex;
            dot.style.boxShadow = \`0 0 8px \${colorHex}\`;
            
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

            // Trigger enter animation
            setTimeout(() => {
                labelDiv.classList.remove('opacity-0', 'translate-y-3');
                labelDiv.classList.add('opacity-100', 'translate-y-0');
            }, 50);
        }

        setInterval(spawnParticle, 700);

        // --- ANIMATION LOOP ---
        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);
            const time = clock.getElapsedTime();

            // Gentle floating rotation
            logoGroup.rotation.y = 0.05 + Math.sin(time * 0.4) * 0.06;
            logoGroup.position.y = Math.sin(time * 0.8) * 0.1;

            for (let i = activeParticles.length - 1; i >= 0; i--) {
                const p = activeParticles[i];
                p.mesh.position.y -= p.speed;
                p.mesh.rotation.x += p.rotSpeedX;
                p.mesh.rotation.y += p.rotSpeedY;

                // Collision with fill plane
                if (p.mesh.position.y <= currentFillY + 0.5) {
                    
                    // Fade out label
                    p.labelDiv.classList.remove('opacity-100', 'translate-y-0');
                    p.labelDiv.classList.add('opacity-0', '-translate-y-2');
                    
                    setTimeout(((meshToRemove) => {
                        return () => scene.remove(meshToRemove);
                    })(p.mesh), 300);

                    activeParticles.splice(i, 1);

                    // Increase fill level
                    targetFillY += 0.5;
                    if (targetFillY > maxFillY) {
                        // Notify parent that fill is complete
                        fillCompleteCount++;
                        window.parent.postMessage({ type: 'DSM_LOADER_FILL_COMPLETE', count: fillCompleteCount }, '*');
                        targetFillY = -3.0;
                        currentFillY = -3.0;
                    }
                }
            }

            // Smoothly animate the fill clipping plane upwards
            currentFillY += (targetFillY - currentFillY) * 0.06;
            fillPlane.constant = currentFillY;
            
            if (window.innerGlowLight) {
                window.innerGlowLight.position.y = currentFillY;
                window.innerGlowLight.intensity = 2 + Math.sin(time * 6) * 1; 
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

    <!-- Loading Phrases Script (non-blocking) -->
    <script>
        const loadingPhrases = [
            "Compiling your creative dreams...",
            "Syncing with the Adobe gods...",
            "Brewing conversion potions...",
            "Polishing your ROI crystals...",
            "Downloading marketing superpowers...",
            "Mixing the perfect color palette...",
            "Convincing fonts to cooperate...",
            "Bribing the loading bar...",
            "Waking up the creative hamsters..."
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

const DSMLoader = ({ onLoadComplete, isContentReady }: DSMLoaderProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const fillCompleteRef = useRef(false);
  const hasTriggeredRef = useRef(false);

  // Create blob URL on mount
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

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DSM_LOADER_FILL_COMPLETE') {
        fillCompleteRef.current = true;
        triggerComplete();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [triggerComplete]);

  // Check if we can complete when content becomes ready
  useEffect(() => {
    if (isContentReady && fillCompleteRef.current) {
      triggerComplete();
    }
  }, [isContentReady, triggerComplete]);

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
        title="DSM Loading"
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

export default DSMLoader;
