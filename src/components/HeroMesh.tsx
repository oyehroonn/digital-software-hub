import { useRef, useEffect } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type MeshAccent = "red" | "azure";

interface HeroMeshProps {
  accent?: MeshAccent;
}

const BACKGROUND = 0x030305;

const COLOR_SCHEMES = {
  red: {
    lines: new THREE.Color("hsl(4, 65%, 54%)"),
    peaks: new THREE.Color("hsl(4, 45%, 22%)"),
    bloom: 1.2,
  },
  azure: {
    lines: new THREE.Color("hsl(204, 61%, 55%)"),
    peaks: new THREE.Color("hsl(204, 50%, 30%)"),
    bloom: 1.4,
  },
};

const NOISE_GLSL = /* glsl */ `
  vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,
                      -0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));
    vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);
    vec4 x12=x0.xyxy+C.xxzz;
    x12.xy-=i1;
    i=mod(i,289.0);
    vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m;m=m*m;
    vec3 x2=2.0*fract(p*C.www)-1.0;
    vec3 h=abs(x2)-0.5;
    vec3 ox=floor(x2+0.5);
    vec3 a0=x2-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g;
    g.x=a0.x*x0.x+h.x*x0.y;
    g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }
`;

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  varying float vElevation;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main(){
    vUv=uv;
    vec3 pos=position;
    float noiseFreq=0.15;
    float noiseAmp=1.5;
    float noise=snoise(vec2(pos.x*noiseFreq+uTime*0.2,pos.y*noiseFreq+uTime*0.1));
    float detailNoise=snoise(vec2(pos.x*0.5-uTime*0.5,pos.y*0.5));
    float dist=distance(pos.xy,uMouse);
    float interactionRadius=12.0;
    float mouseEffect=smoothstep(interactionRadius,0.0,dist)*4.0;
    pos.z+=(noise*noiseAmp)+(detailNoise*0.2)+mouseEffect;
    float ripple=sin(dist*2.0-uTime*3.0)*smoothstep(interactionRadius,0.0,dist)*0.5;
    pos.z+=ripple;
    vElevation=pos.z;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColorLines;
  uniform vec3 uColorPeaks;
  varying float vElevation;
  varying vec2 vUv;
  void main(){
    float mix_=smoothstep(-1.0,3.5,vElevation);
    vec3 col=mix(uColorLines,uColorPeaks,mix_);
    gl_FragColor=vec4(col,0.8);
  }
`;

const LERP_SPEED = 0.04;

const HeroMesh = ({ accent = "red" }: HeroMeshProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const accentRef = useRef<MeshAccent>(accent);

  accentRef.current = accent;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const w = () => parent.clientWidth;
    const h = () => parent.clientHeight;

    let isVisible = true;

    const visObs = new IntersectionObserver(
      ([entry]) => { isVisible = entry.isIntersecting; },
      { threshold: 0, rootMargin: "100px" }
    );
    visObs.observe(parent);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.fog = new THREE.FogExp2(BACKGROUND, 0.025);

    // Camera — matches mesh.html exactly
    const camera = new THREE.PerspectiveCamera(75, w() / h(), 0.1, 100);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, -5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setSize(w(), h());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;

    // Colors
    const currentLines = COLOR_SCHEMES.red.lines.clone();
    const currentPeaks = COLOR_SCHEMES.red.peaks.clone();
    let currentBloom = COLOR_SCHEMES.red.bloom;

    // Geometry — 80x80 grid, 128 segments, matches mesh.html
    const geometry = new THREE.PlaneGeometry(80, 80, 128, 128);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uColorLines: { value: currentLines },
        uColorPeaks: { value: currentPeaks },
      },
      wireframe: true,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Plane — positioned at y=-2, matches mesh.html
    const planeMesh = new THREE.Mesh(geometry, material);
    planeMesh.rotation.x = -Math.PI / 2;
    planeMesh.position.y = -2;
    scene.add(planeMesh);

    // Post-processing — bloom at 1.2 strength, matches mesh.html
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w(), h()),
      1.5, 0.4, 0.85
    );
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;
    bloomPass.threshold = 0;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // Mouse interaction — raycaster plane at y=0, matches mesh.html
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2(0, 0);
    const targetMouse = new THREE.Vector2(0, 0);
    const currentMouse = new THREE.Vector2(0, 0);
    const testPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const onMouseMove = (e: MouseEvent) => {
      if (!isVisible) return;
      mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouseNDC, camera);
      const target = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(testPlane, target);
      if (hit) {
        targetMouse.set(target.x, -target.z);
      }
    };

    const onMouseLeave = () => {
      targetMouse.set(0, 0);
    };

    const onResize = () => {
      const width = w();
      const height = h();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    onResize();

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    parent.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", onResize);

    // Animation — matches mesh.html exactly
    const clock = new THREE.Clock();

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = clock.getElapsedTime();
      material.uniforms.uTime.value = elapsed;

      currentMouse.lerp(targetMouse, 0.1);
      material.uniforms.uMouse.value.copy(currentMouse);

      // Accent color transitions
      const scheme = COLOR_SCHEMES[accentRef.current];
      currentLines.lerp(scheme.lines, LERP_SPEED);
      currentPeaks.lerp(scheme.peaks, LERP_SPEED);
      currentBloom += (scheme.bloom - currentBloom) * LERP_SPEED;
      bloomPass.strength = currentBloom;

      // Camera sway — matches mesh.html
      camera.position.y = 8 + Math.sin(elapsed * 0.5) * 0.5;
      camera.position.x = Math.cos(elapsed * 0.2) * 1;
      camera.lookAt(0, 0, -2);

      composer.render();
    };

    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      visObs.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      parent.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none", display: "block" }}
      />
    </div>
  );
};

export default HeroMesh;
