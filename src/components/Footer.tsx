import { Instagram, Twitter, Linkedin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-surface-dark text-muted-foreground py-20 relative">
      <div className="absolute top-0 left-0 right-0 section-divider-red" />

      <div className="max-w-[1600px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          <div>
            <h3 className="text-[#FEFEFE] font-serif text-2xl mb-6">DSM<span className="text-crimson">.</span></h3>
            <p className="text-sm font-light mb-6 max-w-xs text-[#B1B2B3]/80">
              The premier digital showroom for genuine software licensing. Empowering creators and enterprises since 1994.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"><Instagram className="w-5 h-5" /></a>
              <a href="#" className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"><Twitter className="w-5 h-5" /></a>
              <a href="#" className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"><Linkedin className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-[#FEFEFE] text-sm font-semibold uppercase tracking-[0.14em] mb-6">Shop</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Microsoft Office</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Windows Systems</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Adobe Creative Cloud</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Antivirus & Security</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Server Solutions</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#FEFEFE] text-sm font-semibold uppercase tracking-[0.14em] mb-6">Support</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Help Center</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Activation Guides</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Order Status</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Refund Policy</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Contact Concierge</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#FEFEFE] text-sm font-semibold uppercase tracking-[0.14em] mb-6">Legal</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Terms of Service</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Privacy Policy</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Cookie Policy</a></li>
              <li><a href="#" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Reseller Certificate</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/[0.04] pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-[#B1B2B3]/50">&copy; 2024 Digital Software Market. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <div className="h-6 w-10 bg-white/[0.03] border border-white/[0.05] rounded flex items-center justify-center text-[10px] text-[#B1B2B3]/40">VISA</div>
            <div className="h-6 w-10 bg-white/[0.03] border border-white/[0.05] rounded flex items-center justify-center text-[10px] text-[#B1B2B3]/40">MC</div>
            <div className="h-6 w-10 bg-white/[0.03] border border-white/[0.05] rounded flex items-center justify-center text-[10px] text-[#B1B2B3]/40">AMEX</div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
