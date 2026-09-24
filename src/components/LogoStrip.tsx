import { useScrollAnimation } from "@/hooks/useScrollAnimation";

// Real logo marks, unchanged from before — this is a sizing/layout pass
// only. Microsoft and Adobe already carry their own brand colors in the
// SVG; Apple, Autodesk, SketchUp and V-Ray are genuinely monochrome
// wordmarks/silhouettes in real-world use, so they stay neutral rather than
// having colors invented for them.
const PARTNERS = [
  {
    name: "Microsoft",
    render: () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" className="h-11 w-11 md:h-12 md:w-12">
        <rect x="1" y="1" width="10" height="10" fill="#f25022" />
        <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
        <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
        <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
      </svg>
    ),
  },
  {
    name: "Apple",
    render: () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className="h-14 md:h-16 w-auto" fill="hsl(220 3% 30%)">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
    ),
  },
  {
    name: "Autodesk",
    render: () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" className="h-8 md:h-9 w-auto">
        <text x="0" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="28" fill="hsl(220 3% 30%)" letterSpacing="-1">AUTODESK</text>
      </svg>
    ),
  },
  {
    name: "Adobe",
    render: () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 234" className="h-14 md:h-16 w-auto">
        <path d="M42.5 0H0v234l42.5-56.2V0z" fill="#EB1000" />
        <path d="M197.5 0H240v234l-42.5-56.2V0z" fill="#EB1000" />
        <path d="M120 95.6L162.3 234h-31.8l-12.4-38.5H88.5L120 95.6z" fill="#EB1000" />
      </svg>
    ),
  },
  {
    name: "SketchUp",
    render: () => (
      <span className="font-sans font-bold text-3xl md:text-4xl text-[hsl(220_3%_30%)] tracking-tighter select-none">
        SketchUp
      </span>
    ),
  },
  {
    name: "V-Ray",
    render: () => (
      <span className="font-sans font-bold text-3xl md:text-4xl text-[hsl(220_3%_30%)] tracking-tighter select-none">
        V-Ray
      </span>
    ),
  },
];

const LogoStrip = () => {
  const headingAnim = useScrollAnimation();

  return (
    <section className="section-light border-y border-[hsl(40_8%_88%)] py-24 md:py-28">
      <div className="max-w-[1600px] mx-auto px-6">
        <div ref={headingAnim.ref} className={`max-w-2xl mx-auto text-center mb-16 md:mb-20 ${headingAnim.className}`}>
          <span className="inline-block text-[10px] md:text-xs font-semibold text-crimson uppercase tracking-[0.2em] mb-4">
            Our Partners
          </span>
          <h2 className="font-serif text-3xl md:text-4xl text-[hsl(220_10%_4%)] mb-5">
            Authorized reseller across the Gulf, Africa &amp; beyond
          </h2>
          <p className="text-base text-[hsl(220_6%_34%)] font-light leading-relaxed">
            Every license DSM sells comes straight from the manufacturer's own
            partner program, so authenticity is never in question.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 md:gap-8 max-w-4xl mx-auto">
          {PARTNERS.map((partner) => (
            <div
              key={partner.name}
              className="group flex items-center justify-center h-32 md:h-36 rounded-xl border border-[hsl(40_8%_88%)] bg-[hsl(40_25%_99%)] px-8 transition-all duration-500 hover:border-crimson/40 hover:shadow-[0_12px_32px_-12px_hsl(4_65%_54%/0.18)] hover:-translate-y-0.5"
              title={partner.name}
            >
              <div className="opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                {partner.render()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LogoStrip;
