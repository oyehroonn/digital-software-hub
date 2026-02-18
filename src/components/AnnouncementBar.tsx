import { Phone, Clock, Sparkles } from "lucide-react";

const MESSAGES = [
  "Since 1994, DSM has helped over 15,000 businesses",
  "Free Setup & Installation Assistance on All Licenses",
  "Exclusive Enterprise Volume Discounts Available",
  "Certified Microsoft, Autodesk & Adobe Reseller",
];

const AnnouncementBar = () => {
  return (
    <div className="relative z-50 bg-[#0a0b0d] border-b border-white/[0.04] overflow-hidden">
      <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between h-9">
        {/* Left — Business info */}
        <div className="hidden md:flex items-center gap-6 text-[10px] text-[#B1B2B3]/60 tracking-wide flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Mon–Fri 9AM–5PM
          </span>
          <span className="w-px h-3 bg-white/[0.06]" />
          <a
            href="tel:+97125844433"
            className="flex items-center gap-1.5 hover:text-crimson transition-colors duration-300"
          >
            <Phone className="w-3 h-3" />
            +971 2 58 444 33
          </a>
        </div>

        {/* Center — Scrolling marquee (pure CSS) */}
        <div className="flex-1 overflow-hidden mx-8 relative">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0b0d] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0b0d] to-transparent z-10 pointer-events-none" />
          <div className="marquee-track flex items-center gap-12 whitespace-nowrap">
            {[...MESSAGES, ...MESSAGES].map((msg, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 text-[10px] text-[#B1B2B3]/50 uppercase tracking-[0.12em]"
              >
                <Sparkles className="w-2.5 h-2.5 text-crimson/40" />
                {msg}
              </span>
            ))}
          </div>
        </div>

        {/* Right — Quick links */}
        <div className="hidden lg:flex items-center gap-4 text-[10px] text-[#B1B2B3]/50 tracking-wide flex-shrink-0">
          <a href="#" className="hover:text-crimson transition-colors duration-300">My Account</a>
          <span className="w-px h-3 bg-white/[0.06]" />
          <a href="#" className="hover:text-crimson transition-colors duration-300">Help</a>
          <span className="w-px h-3 bg-white/[0.06]" />
          <a href="#" className="hover:text-crimson transition-colors duration-300">Track Order</a>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementBar;
