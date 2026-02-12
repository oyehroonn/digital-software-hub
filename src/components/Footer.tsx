import { Instagram, Twitter, Linkedin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-stone-900 text-stone-400 py-20">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          <div>
            <h3 className="text-white font-serif text-2xl mb-6">DSM.</h3>
            <p className="text-sm font-light mb-6 max-w-xs">
              The premier digital showroom for genuine software licensing. Empowering creators and enterprises since 1994.
            </p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors"><Instagram className="w-5 h-5" /></a>
              <a href="#" className="hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a>
              <a href="#" className="hover:text-white transition-colors"><Linkedin className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-widest mb-6">Shop</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Microsoft Office</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Windows Systems</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Adobe Creative Cloud</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Antivirus & Security</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Server Solutions</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-widest mb-6">Support</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Activation Guides</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Order Status</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Refund Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Concierge</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-widest mb-6">Legal</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Reseller Certificate</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-stone-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs">© 2024 Digital Software Market. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <div className="h-6 w-10 bg-stone-800 rounded flex items-center justify-center text-[10px] text-stone-500">VISA</div>
            <div className="h-6 w-10 bg-stone-800 rounded flex items-center justify-center text-[10px] text-stone-500">MC</div>
            <div className="h-6 w-10 bg-stone-800 rounded flex items-center justify-center text-[10px] text-stone-500">AMEX</div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
