const LogoStrip = () => {
  return (
    <div className="border-y border-border bg-white py-12">
      <div className="max-w-[1600px] mx-auto px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
          Authorized Global Partner For
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-60 grayscale hover:grayscale-0 transition-all duration-700">
          {/* Microsoft */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" className="h-6 w-6">
            <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
            <rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
            <rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
            <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
          </svg>

          {/* Apple */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className="h-7 w-auto" fill="#555">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>

          {/* Autodesk */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" className="h-4 w-auto">
            <text x="0" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="28" fill="#555" letterSpacing="-1">AUTODESK</text>
          </svg>

          {/* Adobe */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 234" className="h-7 w-auto">
            <path d="M42.5 0H0v234l42.5-56.2V0z" fill="#EB1000"/>
            <path d="M197.5 0H240v234l-42.5-56.2V0z" fill="#EB1000"/>
            <path d="M120 95.6L162.3 234h-31.8l-12.4-38.5H88.5L120 95.6z" fill="#EB1000"/>
          </svg>

          {/* SketchUp */}
          <span className="font-sans font-bold text-xl text-stone-600 tracking-tighter select-none">SketchUp</span>

          {/* V-Ray */}
          <span className="font-sans font-bold text-xl text-stone-600 tracking-tighter select-none">V-Ray</span>
        </div>
      </div>
    </div>
  );
};

export default LogoStrip;
