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
                      <li key={cat}>
                        <button
                          onClick={() => setActiveCategory(cat)}
                          className={`w-full text-left text-sm flex items-center justify-between transition-colors duration-300 ${
                            activeCategory === cat
                              ? "text-crimson font-medium"
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
                  <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-6 block">Official Partner Showroom</span>
                  <div className="grid grid-cols-2 gap-4">
                    {categoryBrands[activeCategory]?.map((brand) => (
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

                {/* Featured Product - Dynamic GLB based on category */}
                <div className="col-span-4 relative group cursor-pointer overflow-hidden rounded-md bg-gradient-to-br from-[#0a0b0c] to-[#060708] border border-white/[0.06] h-64">
                  {/* 3D Model */}
                  <div className="absolute inset-0 z-0">
                    <ProductModelViewer
                      key={activeCategory}
                      glbSrc={categoryFeaturedModel[activeCategory]?.glb}
                      fallbackIcon={
                        <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                          <span className="text-xl font-bold text-white/20">
                            {activeCategory.charAt(0)}
                          </span>
                        </div>
                      }
                    />
                  </div>
                  
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/40 to-transparent z-10 pointer-events-none" />
                  
                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                    <span className="inline-block px-2 py-1 bg-crimson/20 backdrop-blur text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 rounded-sm text-crimson">Featured</span>
                    <h4 className="font-serif text-lg leading-tight mb-1 text-[#FEFEFE]">
                      {categoryFeaturedModel[activeCategory]?.title}
                    </h4>
                    <p className="text-xs text-[#B1B2B3] mb-3 line-clamp-2">
                      {categoryFeaturedModel[activeCategory]?.desc}
                    </p>
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
