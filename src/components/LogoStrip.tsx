const LogoStrip = () => {
  return (
    <div className="border-y border-border bg-white py-12">
      <div className="max-w-[1600px] mx-auto px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
          Authorized Global Partner For
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-60 grayscale hover:grayscale-0 transition-all duration-700">
          <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="h-6 w-auto object-contain" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/a/ac/App_Store_%28iOS%29.svg" alt="Apple" className="h-8 w-auto object-contain" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Autodesk_Logo_2021.svg/2560px-Autodesk_Logo_2021.svg.png" alt="Autodesk" className="h-4 w-auto object-contain" />
          <span className="font-serif text-2xl text-stone-800">Adobe</span>
          <span className="font-sans font-bold text-xl text-stone-800 tracking-tighter">SketchUp</span>
          <span className="font-sans font-bold text-xl text-stone-800 tracking-tighter">V-Ray</span>
        </div>
      </div>
    </div>
  );
};

export default LogoStrip;
