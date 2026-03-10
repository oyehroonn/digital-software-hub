import { User, ShoppingBag, ChevronDown, ArrowRight, LayoutGrid, PenTool, Box, ShieldCheck, Monitor, Cpu } from "lucide-react";
import SearchBar from "./SearchBar";
import ProductModelViewer from "./ProductModelViewer";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

const categories = [
  "Operating Systems",
  "Productivity & Office",
  "Design & Creativity",
  "CAD & Engineering",
  "Security & Utility",
];

const categoryBrands: Record<string, { name: string; desc: string; icon: typeof LayoutGrid }[]> = {
  "Operating Systems": [
    { name: "Microsoft", desc: "Windows 10, 11, Server 2022/2025", icon: Monitor },
    { name: "VMware", desc: "Workstation, Fusion Pro", icon: Cpu },
  ],
  "Productivity & Office": [
    { name: "Microsoft", desc: "Office 365, Project, Visio", icon: LayoutGrid },
    { name: "Adobe", desc: "Acrobat Pro, Sign", icon: PenTool },
    { name: "Corel", desc: "WordPerfect, PDF Fusion", icon: LayoutGrid },
  ],
  "Design & Creativity": [
    { name: "Adobe", desc: "Creative Cloud, Photoshop, Illustrator", icon: PenTool },
    { name: "Corel", desc: "CorelDRAW, Painter, Photo-Paint", icon: PenTool },
    { name: "Maxon", desc: "Cinema 4D, ZBrush, Red Giant", icon: Box },
  ],
  "CAD & Engineering": [
    { name: "Autodesk", desc: "AutoCAD, Revit, Civil 3D, Inventor", icon: Box },
    { name: "Chaos", desc: "V-Ray, Corona, Enscape", icon: Box },
    { name: "SketchUp", desc: "Pro, Studio, LayOut", icon: Box },
  ],
  "Security & Utility": [
    { name: "Kaspersky", desc: "Total Security, VPN, Endpoint", icon: ShieldCheck },
    { name: "Microsoft", desc: "Defender, Intune, Azure AD", icon: ShieldCheck },
    { name: "Acronis", desc: "Cyber Protect, Backup", icon: ShieldCheck },
  ],
};

const categoryFeaturedModel: Record<string, { glb: string; title: string; desc: string }> = {
  "Operating Systems": {
    glb: "/models/Windows_11_Enterprise_FIXED.glb",
    title: "Windows 11 Enterprise",
    desc: "The most secure Windows for business and enterprise.",
  },
  "Productivity & Office": {
    glb: "/models/Microsoft_365_Business_Premium_FIXED.glb",
    title: "Microsoft 365 Business Premium",
    desc: "Complete productivity suite for modern teams.",
  },
  "Design & Creativity": {
    glb: "/models/Adobe_Creative_Cloud_FIXED.glb",
    title: "Adobe Creative Cloud",
    desc: "Industry-leading creative tools for designers.",
  },
  "CAD & Engineering": {
    glb: "/models/AutoCAD_2026_FIXED.glb",
    title: "AutoCAD 2026",
    desc: "Industry-standard CAD software for professionals.",
  },
  "Security & Utility": {
    glb: "/models/SQL_Server_2025_Standard_FIXED.glb",
    title: "SQL Server 2025 Standard",
    desc: "Enterprise database management and security.",
  },
};

const Header = () => {
  const [isOverLightSection, setIsOverLightSection] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Productivity & Office");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const lightSections = document.querySelectorAll('.section-light');
      const headerHeight = 132; // 36px announcement + 96px header
      
      // Track if user has scrolled past initial view
      setHasScrolled(window.scrollY > 50);
      
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

  // Dynamic text color based on background
  // When over light section: dark text
  // When scrolled (over dark content with blur): bright white for readability
  // Default (at top, no scroll): gray
  const navTextColor = isOverLightSection 
    ? 'text-[#1a1a1a] hover:text-crimson' 
    : hasScrolled 
      ? 'text-white hover:text-crimson'
      : 'text-[#B1B2B3] hover:text-crimson';
  
  const iconColor = isOverLightSection 
    ? 'text-[#1a1a1a] hover:text-crimson' 
    : hasScrolled
      ? 'text-white hover:text-crimson'
      : 'text-[#B1B2B3] hover:text-crimson';

  return (
    <>
      {/* Header - Pure glass blur on hover OR when scrolled */}
      <header 
        className={`fixed top-9 left-0 right-0 z-50 transition-all duration-500 bg-transparent hover:backdrop-blur-md h-24 ${
          hasScrolled ? 'backdrop-blur-md' : ''
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-6 md:px-12 h-24 flex items-center justify-between relative">
          {/* Logo */}
          <Link to="/" className="z-50 relative group flex items-center">
            <img 
              src={isOverLightSection ? "/dsm.png" : "/dsm-white.png"} 
              alt="DSM" 
              className="h-8 w-auto transition-all duration-300 group-hover:opacity-80"
            />
            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-crimson transition-all duration-500 group-hover:w-full" />
          </Link>

          {/* Desktop Menu */}
          <nav className="hidden lg:flex items-center gap-8 h-full overflow-visible">
            <div 
              className="h-full flex items-center"
              onMouseEnter={() => setIsMenuOpen(true)}
              onMouseLeave={() => setIsMenuOpen(false)}
            >
              <button className={`text-sm font-medium transition-colors duration-300 tracking-wide h-full flex items-center gap-1 ${isMenuOpen ? 'text-crimson' : navTextColor}`}>
                Software <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isMenuOpen ? 'rotate-180 opacity-100' : 'opacity-50'}`} />
              </button>
            </div>

            <Link to="/store" className={`text-sm font-medium transition-colors duration-300 ${navTextColor}`}>Store</Link>
            <Link to="/marketing" className={`text-sm font-medium transition-colors duration-300 ${navTextColor}`}>DSM Marketing</Link>
            <a href="#" className={`text-sm font-medium transition-colors duration-300 ${navTextColor}`}>Enterprise</a>
            <a href="#" className={`text-sm font-medium transition-colors duration-300 ${navTextColor}`}>Support</a>
            <a href="#" className={`text-sm font-medium transition-colors duration-300 ${navTextColor}`}>About</a>
          </nav>

          {/* Search & Icons */}
          <div className="flex items-center gap-4">
            <div className="hidden md:block w-64">
              <SearchBar darkText={isOverLightSection} />
            </div>
            <a href="#" className={`transition-colors duration-300 ${iconColor}`}><User className="w-5 h-5" strokeWidth={1.5} /></a>
            <a href="#" className={`relative transition-colors duration-300 ${iconColor}`}>
              <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-crimson rounded-full" />
            </a>
          </div>
        </div>
      </header>
      
      {/* Mega Menu - SEPARATE element, matches header blur behavior (top-[132px] = 36px announcement + 96px header) */}
      <div 
        className={`fixed left-0 right-0 top-[132px] z-40 transition-all duration-300 ${
          isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
        onMouseEnter={() => setIsMenuOpen(true)}
        onMouseLeave={() => setIsMenuOpen(false)}
      >
        {/* Blur background - adapts to light/dark sections */}
        <div className={`absolute inset-0 backdrop-blur-lg ${
          isOverLightSection 
            ? 'bg-[rgba(255,255,255,0.8)]' 
            : 'bg-[rgba(8,8,10,0.65)]'
        }`} />
        
        {/* Content container */}
        <div className="relative max-w-[1200px] mx-auto px-8 md:px-12 pt-8 pb-12 overflow-auto max-h-[80vh]">
          <div className="grid grid-cols-12 gap-8">
            {/* Categories */}
            <div className={`col-span-3 border-r ${isOverLightSection ? 'border-black/[0.08]' : 'border-white/[0.06]'}`}>
              <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] mb-6 block ${isOverLightSection ? 'text-[#666]/60' : 'text-[#B1B2B3]/60'}`}>Categories</span>
              <ul className="space-y-3">
                {categories.map((cat) => (
                  <li key={cat}>
                    <button
                      onClick={() => setActiveCategory(cat)}
                      className={`w-full text-left text-sm flex items-center justify-between transition-colors duration-300 ${
                        activeCategory === cat
                          ? "text-crimson font-medium"
                          : isOverLightSection 
                            ? "text-[#333] hover:text-crimson group/link"
                            : "text-[#B1B2B3] hover:text-crimson group/link"
                      }`}
                    >
                      {cat}
                      <ArrowRight className={`w-3 h-3 ${activeCategory === cat ? "text-crimson" : "opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0"}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Partner Showroom - Dynamic based on category */}
            <div className="col-span-5 px-8">
              <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] mb-6 block ${isOverLightSection ? 'text-[#666]/60' : 'text-[#B1B2B3]/60'}`}>Official Partner Showroom</span>
              <div className="grid grid-cols-2 gap-4">
                {categoryBrands[activeCategory]?.map((brand) => (
                  <a key={brand.name} href="#" className={`p-4 rounded-md hover:border-crimson/20 transition-all duration-300 group/brand ${
                    isOverLightSection 
                      ? 'bg-black/[0.03] border border-black/[0.06] hover:bg-black/[0.06]'
                      : 'bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <brand.icon className={`w-4 h-4 group-hover/brand:text-crimson transition-colors duration-300 ${isOverLightSection ? 'text-[#666]' : 'text-[#B1B2B3]'}`} />
                      <span className={`text-sm font-medium ${isOverLightSection ? 'text-[#1a1a1a]' : 'text-[#FEFEFE]'}`}>{brand.name}</span>
                    </div>
                    <p className={`text-xs ${isOverLightSection ? 'text-[#666]/70' : 'text-[#B1B2B3]/70'}`}>{brand.desc}</p>
                  </a>
                ))}
              </div>
            </div>

            {/* Featured Product - Dynamic GLB based on category */}
            <div className={`col-span-4 relative cursor-pointer overflow-hidden rounded-md h-64 ${
              isOverLightSection 
                ? 'bg-gradient-to-br from-[#f0f0f0] to-[#e8e8e8] border border-black/[0.08]'
                : 'bg-gradient-to-br from-[#0a0b0c] to-[#060708] border border-white/[0.06]'
            }`}>
              {/* 3D Model */}
              <div className="absolute inset-0 z-0">
                <ProductModelViewer
                  key={activeCategory}
                  glbSrc={categoryFeaturedModel[activeCategory]?.glb}
                  fallbackIcon={
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                      isOverLightSection 
                        ? 'bg-black/[0.04] border border-black/[0.08]'
                        : 'bg-white/[0.04] border border-white/[0.08]'
                    }`}>
                      <span className={`text-xl font-bold ${isOverLightSection ? 'text-black/20' : 'text-white/20'}`}>
                        {activeCategory.charAt(0)}
                      </span>
                    </div>
                  }
                />
              </div>
              
              {/* Gradient overlay */}
              <div className={`absolute inset-0 z-10 pointer-events-none ${
                isOverLightSection 
                  ? 'bg-gradient-to-t from-[#e8e8e8] via-[#e8e8e8]/40 to-transparent'
                  : 'bg-gradient-to-t from-[#060708] via-[#060708]/40 to-transparent'
              }`} />
              
              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                <span className="inline-block px-2 py-1 bg-crimson/20 backdrop-blur text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 rounded-sm text-crimson">Featured</span>
                <h4 className={`font-serif text-lg leading-tight mb-1 ${isOverLightSection ? 'text-[#1a1a1a]' : 'text-[#FEFEFE]'}`}>
                  {categoryFeaturedModel[activeCategory]?.title}
                </h4>
                <p className={`text-xs mb-3 line-clamp-2 ${isOverLightSection ? 'text-[#666]' : 'text-[#B1B2B3]'}`}>
                  {categoryFeaturedModel[activeCategory]?.desc}
                </p>
                <span className="text-xs border-b border-crimson/40 pb-0.5 inline-block text-crimson hover:border-crimson transition-colors">Explore Collection</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
