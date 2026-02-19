import { User, ShoppingBag, ChevronDown, ArrowRight, LayoutGrid, PenTool, Box, ShieldCheck } from "lucide-react";
import SearchBar from "./SearchBar";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

const categories = [
  { name: "Operating Systems", active: false },
  { name: "Productivity & Office", active: true },
  { name: "Design & Creativity", active: false },
  { name: "CAD & Engineering", active: false },
  { name: "Security & Utility", active: false },
];

const brands = [
  { name: "Microsoft", desc: "Windows, Office, Server", icon: LayoutGrid },
  { name: "Adobe", desc: "Creative Cloud, Acrobat", icon: PenTool },
  { name: "Autodesk", desc: "AutoCAD, Revit, Maya", icon: Box },
  { name: "Kaspersky", desc: "Total Security, VPN", icon: ShieldCheck },
];

const Header = () => {
  const [isOverLightSection, setIsOverLightSection] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const lightSections = document.querySelectorAll('.section-light');
      const headerHeight = 64;
      
      for (const section of lightSections) {
        const rect = section.getBoundingClientRect();
        if (rect.top < headerHeight && rect.bottom > 0) {
          setIsOverLightSection(true);
          return;
        }
      }
      setIsOverLightSection(false);
    };
    
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 w-full z-50 transition-all duration-500 border-b border-theme bg-surface-dark/85 backdrop-blur-2xl">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between relative">
        {/* Logo */}
        <Link to="/" className="z-50 relative group flex items-center">
          <img 
            src="/dsm.png" 
            alt="DSM" 
            className="h-8 w-auto transition-opacity duration-300 group-hover:opacity-80"
          />
          <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-crimson transition-all duration-500 group-hover:w-full" />
        </Link>

        {/* Desktop Menu */}
        <nav className="hidden lg:flex items-center gap-8 h-full overflow-visible">
          <div className="group h-full flex items-center nav-item">
            <button className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300 tracking-wide h-full flex items-center gap-1">
              Software <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {/* Mega Menu */}
            <div 
              className="mega-menu fixed left-4 right-4 top-16 max-w-[1200px] mx-auto backdrop-blur-2xl border border-white/[0.1] shadow-premium-lg rounded-b-lg pt-8 pb-12 px-8 md:px-12 z-50 origin-top overflow-auto max-h-[80vh]" 
              style={{ 
                background: "linear-gradient(180deg, rgba(20,10,15,0.15) 0%, rgba(60,20,30,0.12) 50%, rgba(20,10,15,0.18) 100%)",
                boxShadow: "inset 0 0 80px rgba(200,50,70,0.06), 0 25px 50px -12px rgba(0,0,0,0.5)"
              }}>
              <div className="grid grid-cols-12 gap-8">
                {/* Categories */}
                <div className="col-span-3 border-r border-white/[0.06]">
                  <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-6 block">Categories</span>
                  <ul className="space-y-3">
                    {categories.map((cat) => (
                      <li key={cat.name}>
                        <a
                          href="#"
                          className={`text-sm flex items-center justify-between transition-colors duration-300 ${
                            cat.active
                              ? "text-crimson font-medium"
                              : "text-[#B1B2B3] hover:text-crimson group/link"
                          }`}
                        >
                          {cat.name}
                          <ArrowRight className={`w-3 h-3 ${cat.active ? "text-crimson" : "opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0"}`} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Partner Showroom */}
                <div className="col-span-5 px-8">
                  <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-6 block">Official Partner Showroom</span>
                  <div className="grid grid-cols-2 gap-4">
                    {brands.map((brand) => (
                      <a key={brand.name} href="#" className="p-4 bg-white/[0.03] border border-white/[0.04] rounded-md hover:bg-white/[0.06] hover:border-crimson/20 transition-all duration-300 group/brand">
                        <div className="flex items-center gap-2 mb-2">
                          <brand.icon className="w-4 h-4 text-[#B1B2B3] group-hover/brand:text-crimson transition-colors duration-300" />
                          <span className="text-sm font-medium text-[#FEFEFE]">{brand.name}</span>
                        </div>
                        <p className="text-xs text-[#B1B2B3]/70">{brand.desc}</p>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Editorial Feature */}
                <div className="col-span-4 relative group cursor-pointer overflow-hidden rounded-md bg-surface-dark text-foreground-primary p-6 flex flex-col justify-end h-64 border border-theme">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/60 to-transparent z-10" />
                  <img
                    src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop"
                    className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700 ease-out z-0"
                    alt="Creative workspace"
                  />
                  <div className="relative z-20">
                    <span className="inline-block px-2 py-1 bg-crimson/20 backdrop-blur text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 rounded-sm text-crimson">Featured</span>
                    <h4 className="font-serif text-lg leading-tight mb-1 text-[#FEFEFE]">The Creative Suite 2025</h4>
                    <p className="text-xs text-[#B1B2B3] mb-3 line-clamp-2">Upgrade your workflow with the latest tools from Adobe.</p>
                    <span className="text-xs border-b border-crimson/40 pb-0.5 inline-block text-crimson hover:border-crimson transition-colors">Explore Collection</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Link to="/store" className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300">Store</Link>
          <a href="#" className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300">Enterprise</a>
          <a href="#" className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300">Support</a>
          <a href="#" className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300">About</a>
        </nav>

        {/* Search & Icons */}
        <div className="flex items-center gap-4">
          <div className="hidden md:block w-64">
            <SearchBar darkText={isOverLightSection} />
          </div>
          <a href="#" className="text-[#B1B2B3] hover:text-crimson transition-colors duration-300"><User className="w-5 h-5" strokeWidth={1.5} /></a>
          <a href="#" className="relative text-[#B1B2B3] hover:text-crimson transition-colors duration-300">
            <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-crimson rounded-full" />
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
