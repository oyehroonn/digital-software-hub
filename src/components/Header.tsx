import { User, ShoppingBag, ChevronDown, ArrowRight, LayoutGrid, PenTool, Box, ShieldCheck, Monitor, Cpu, Crown, Megaphone, Wrench, Building2, Users, LifeBuoy, Info, Menu, X, Palette } from "lucide-react";
import SearchBar from "./SearchBar";
import ProductModelViewer from "./ProductModelViewer";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAccount } from "@/hooks/useAccount";
import { useAccountDialog } from "@/components/account/AccountProvider";
import { useResellerDialog } from "@/components/reseller/ResellerProvider";
import { currentReseller } from "@/lib/reseller";

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

/**
 * A single entry inside a grouped nav dropdown. Exactly one of `to` (SPA route),
 * `href` (external / mailto) or `onClick` (custom handler) drives navigation, so
 * every existing route/handler is preserved when items are grouped.
 */
type DropdownItem = {
  label: string;
  desc: string;
  icon: typeof LayoutGrid;
  to?: string;
  href?: string;
  onClick?: () => void;
};

/**
 * Compact hover dropdown used to group secondary nav links (Solutions, Company)
 * so the top bar stays uncluttered. Mirrors the mega-menu's glass/crimson styling
 * on a smaller panel. Opening is coordinated by the parent so only one is open.
 */
const NavDropdown = ({
  label,
  items,
  isOpen,
  onOpen,
  onClose,
  navTextColor,
  isOverLightSection,
}: {
  label: string;
  items: DropdownItem[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  navTextColor: string;
  isOverLightSection: boolean;
}) => {
  const panelTheme = isOverLightSection
    ? "bg-white/90 border-black/[0.08] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]"
    : "bg-[rgba(10,10,12,0.85)] border-white/[0.08] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]";
  const itemHover = isOverLightSection ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.05]";
  const iconBox = isOverLightSection ? "bg-black/[0.05] text-[#555]" : "bg-white/[0.05] text-[#B1B2B3]";
  const titleColor = isOverLightSection ? "text-[#1a1a1a]" : "text-[#FEFEFE]";
  const descColor = isOverLightSection ? "text-[#666]/80" : "text-[#B1B2B3]/70";

  return (
    <div className="relative h-full flex items-center" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        className={`text-sm font-medium transition-colors duration-300 tracking-wide h-full flex items-center gap-1 ${isOpen ? "text-crimson" : navTextColor}`}
      >
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isOpen ? "rotate-180 opacity-100" : "opacity-50"}`} />
      </button>

      {/* pt-3 keeps an invisible hover bridge so the panel doesn't close in the gap */}
      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-3 transition-all duration-200 ${
          isOpen ? "opacity-100 visible translate-y-0" : "opacity-0 invisible pointer-events-none -translate-y-1"
        }`}
      >
        <div className={`w-72 rounded-xl border backdrop-blur-lg p-2 ${panelTheme}`}>
          {items.map((item) => {
            const inner = (
              <>
                <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-300 group-hover/di:text-crimson ${iconBox}`}>
                  <item.icon className="w-4 h-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium leading-tight transition-colors duration-300 group-hover/di:text-crimson ${titleColor}`}>{item.label}</span>
                  <span className={`block text-xs leading-snug mt-0.5 ${descColor}`}>{item.desc}</span>
                </span>
              </>
            );
            const cls = `group/di flex items-start gap-3 p-2.5 rounded-lg transition-colors duration-300 ${itemHover}`;
            if (item.to) {
              return (
                <Link key={item.label} to={item.to} onClick={onClose} className={cls}>
                  {inner}
                </Link>
              );
            }
            if (item.href) {
              return (
                <a key={item.label} href={item.href} onClick={onClose} className={cls}>
                  {inner}
                </a>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  onClose();
                }}
                className={`w-full text-left ${cls}`}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Header = () => {
  const { cartItemCount } = useApp();
  const { isMember } = useAccount();
  const { open: openAccountDialog } = useAccountDialog();
  const { open: openResellerDialog } = useResellerDialog();
  const navigate = useNavigate();
  const [isOverLightSection, setIsOverLightSection] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Productivity & Office");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"solutions" | "company" | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  const goReseller = () => (currentReseller() ? navigate("/reseller") : openResellerDialog());

  // Secondary links grouped into two compact dropdowns to de-clutter the bar.
  const solutionsItems: DropdownItem[] = [
    { label: "DSM Marketing", desc: "Campaigns, branding & growth services", icon: Megaphone, to: "/marketing" },
    { label: "DSM Services", desc: "Deployment, licensing & managed support", icon: Wrench, to: "/services" },
  ];
  const companyItems: DropdownItem[] = [
    { label: "Registered Creatives", desc: "DSM-original product box collection", icon: Palette, to: "/creatives" },
    { label: "Enterprise", desc: "Volume licensing & procurement", icon: Building2, to: "/store" },
    { label: "Resellers", desc: "Partner portal & wholesale pricing", icon: Users, onClick: goReseller },
    { label: "Support", desc: "Help center, FAQs & contact", icon: LifeBuoy, to: "/support" },
    { label: "About", desc: "Who we are & what we do", icon: Info, to: "/services" },
  ];

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

          {/* Desktop Menu — grouped into 5 uncluttered top-level items */}
          <nav className="hidden lg:flex items-center gap-7 xl:gap-8 h-full overflow-visible mx-6">
            <div
              className="h-full flex items-center"
              onMouseEnter={() => { setIsMenuOpen(true); setOpenDropdown(null); }}
              onMouseLeave={() => setIsMenuOpen(false)}
            >
              <button className={`text-sm font-medium transition-colors duration-300 tracking-wide h-full flex items-center gap-1 ${isMenuOpen ? 'text-crimson' : navTextColor}`}>
                Software <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isMenuOpen ? 'rotate-180 opacity-100' : 'opacity-50'}`} />
              </button>
            </div>

            <Link to="/store" className={`text-sm font-medium transition-colors duration-300 ${navTextColor}`}>Store</Link>

            <NavDropdown
              label="Solutions"
              items={solutionsItems}
              isOpen={openDropdown === "solutions"}
              onOpen={() => { setOpenDropdown("solutions"); setIsMenuOpen(false); }}
              onClose={() => setOpenDropdown((d) => (d === "solutions" ? null : d))}
              navTextColor={navTextColor}
              isOverLightSection={isOverLightSection}
            />

            {/* Standout crimson CTA — the key member pill */}
            <Link
              to="/exclusive"
              className="group text-sm font-medium text-crimson hover:text-crimson-dark transition-all duration-300 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-crimson/30 bg-crimson/[0.06] hover:bg-crimson/[0.12] hover:border-crimson/50"
            >
              <Crown className="w-3.5 h-3.5 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.75} />
              Exclusive Members
            </Link>

            <NavDropdown
              label="Company"
              items={companyItems}
              isOpen={openDropdown === "company"}
              onOpen={() => { setOpenDropdown("company"); setIsMenuOpen(false); }}
              onClose={() => setOpenDropdown((d) => (d === "company" ? null : d))}
              navTextColor={navTextColor}
              isOverLightSection={isOverLightSection}
            />
          </nav>

          {/* Search & Icons */}
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <div className="hidden md:block w-52 lg:w-56 xl:w-64">
              <SearchBar darkText={isOverLightSection} />
            </div>
            <button
              type="button"
              aria-label={isMember ? "Your account" : "Sign in or create a free account"}
              onClick={() => (isMember ? navigate("/account") : openAccountDialog("/account"))}
              className={`relative transition-colors duration-300 ${isMember ? "text-crimson hover:text-crimson-dark" : iconColor}`}
            >
              <User className="w-5 h-5" strokeWidth={1.5} />
              {isMember && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-crimson ring-2 ring-[#060708]" />
              )}
            </button>
            <Link to="/cart" aria-label={cartItemCount > 0 ? `Cart, ${cartItemCount} item${cartItemCount === 1 ? "" : "s"}` : "Cart"} className={`relative transition-colors duration-300 ${iconColor}`}>
              <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-crimson text-[#FEFEFE] text-[10px] font-semibold leading-[18px] text-center">
                  {cartItemCount > 99 ? "99+" : cartItemCount}
                </span>
              )}
            </Link>

            {/* Mobile hamburger — nav collapses below lg */}
            <button
              type="button"
              aria-label={isMobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileOpen}
              onClick={() => setIsMobileOpen((v) => !v)}
              className={`lg:hidden transition-colors duration-300 ${iconColor}`}
            >
              {isMobileOpen ? <X className="w-6 h-6" strokeWidth={1.5} /> : <Menu className="w-6 h-6" strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu — same grouping as desktop, revealed below lg */}
      <div
        className={`lg:hidden fixed inset-x-0 top-[132px] bottom-0 z-40 transition-all duration-300 ${
          isMobileOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        }`}
      >
        <div
          className={`absolute inset-0 backdrop-blur-lg ${isOverLightSection ? "bg-[rgba(255,255,255,0.92)]" : "bg-[rgba(6,7,8,0.92)]"}`}
          onClick={() => setIsMobileOpen(false)}
        />
        <nav className="relative max-w-[640px] mx-auto px-6 py-8 overflow-auto max-h-full flex flex-col gap-6">
          <div className="md:hidden">
            <SearchBar darkText={isOverLightSection} />
          </div>

          <Link to="/store" onClick={() => setIsMobileOpen(false)} className={`text-lg font-medium ${isOverLightSection ? "text-[#1a1a1a]" : "text-[#FEFEFE]"}`}>Store</Link>

          <Link
            to="/exclusive"
            onClick={() => setIsMobileOpen(false)}
            className="inline-flex items-center gap-2 text-lg font-medium text-crimson px-4 py-2 rounded-full border border-crimson/30 bg-crimson/[0.08] w-fit"
          >
            <Crown className="w-4 h-4" strokeWidth={1.75} /> Exclusive Members
          </Link>

          {[
            { title: "Solutions", items: solutionsItems },
            { title: "Company", items: companyItems },
          ].map((group) => (
            <div key={group.title}>
              <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] mb-3 block ${isOverLightSection ? "text-[#666]/60" : "text-[#B1B2B3]/60"}`}>{group.title}</span>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const label = (
                    <span className="flex items-center gap-3">
                      <item.icon className={`w-4 h-4 ${isOverLightSection ? "text-[#555]" : "text-[#B1B2B3]"}`} strokeWidth={1.75} />
                      <span className={`text-base font-medium ${isOverLightSection ? "text-[#1a1a1a]" : "text-[#FEFEFE]"}`}>{item.label}</span>
                    </span>
                  );
                  const cls = "py-2";
                  if (item.to) return <Link key={item.label} to={item.to} onClick={() => setIsMobileOpen(false)} className={cls}>{label}</Link>;
                  if (item.href) return <a key={item.label} href={item.href} onClick={() => setIsMobileOpen(false)} className={cls}>{label}</a>;
                  return (
                    <button key={item.label} type="button" onClick={() => { item.onClick?.(); setIsMobileOpen(false); }} className={`text-left ${cls}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
      
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
                  <Link key={brand.name} to="/store" className={`p-4 rounded-md hover:border-crimson/20 transition-all duration-300 group/brand ${
                    isOverLightSection 
                      ? 'bg-black/[0.03] border border-black/[0.06] hover:bg-black/[0.06]'
                      : 'bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <brand.icon className={`w-4 h-4 group-hover/brand:text-crimson transition-colors duration-300 ${isOverLightSection ? 'text-[#666]' : 'text-[#B1B2B3]'}`} />
                      <span className={`text-sm font-medium ${isOverLightSection ? 'text-[#1a1a1a]' : 'text-[#FEFEFE]'}`}>{brand.name}</span>
                    </div>
                    <p className={`text-xs ${isOverLightSection ? 'text-[#666]/70' : 'text-[#B1B2B3]/70'}`}>{brand.desc}</p>
                  </Link>
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
