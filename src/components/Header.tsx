import { User, ShoppingBag, ChevronDown, ArrowRight, LayoutGrid, PenTool, Box, ShieldCheck } from "lucide-react";
import SearchBar from "./SearchBar";
import { Link } from "react-router-dom";

<<<<<<< Updated upstream
const categories = [
  { name: "Operating Systems", active: false },
  { name: "Productivity & Office", active: true },
  { name: "Design & Creativity", active: false },
  { name: "CAD & Engineering", active: false },
  { name: "Security & Utility", active: false },
=======
// ── API base for model URLs ──
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5051';

// ── Shared mega-menu gradient style (premium crimson-tinted gradient + inset glow) ──
const MEGA_MENU_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(20,10,15,0.97) 0%, rgba(30,12,18,0.98) 50%, rgba(20,10,15,0.97) 100%)",
  boxShadow: "inset 0 0 80px rgba(200,50,70,0.06), 0 25px 50px -12px rgba(0,0,0,0.5)",
};

// ── Real navigation categories matching the product catalog ──

interface SubCategory {
  name: string;
  filter: string;
}

interface NavSection {
  title: string;
  subcategories: SubCategory[];
}

// Featured 3D models for each category (id, folder, label)
interface FeaturedModel {
  id: number;
  folder: string;
  label: string;
  subtitle: string;
}

const microsoftFeatured: FeaturedModel[] = [
  { id: 8384, folder: "8384_Windows_11_Pro", label: "Windows 11 Pro", subtitle: "Latest OS" },
  { id: 9009, folder: "9009_Microsoft_Office_2024_Professional_Plus_MAK_-_Multi-User_Lic", label: "Office 2024", subtitle: "Productivity Suite" },
  { id: 8977, folder: "8977_Microsoft_SQL_Server_2022_Standard_Edition", label: "SQL Server 2022", subtitle: "Database" },
>>>>>>> Stashed changes
];

const brands = [
  { name: "Microsoft", desc: "Windows, Office, Server", icon: LayoutGrid },
  { name: "Adobe", desc: "Creative Cloud, Acrobat", icon: PenTool },
  { name: "Autodesk", desc: "AutoCAD, Revit, Maya", icon: Box },
  { name: "Kaspersky", desc: "Total Security, VPN", icon: ShieldCheck },
];

<<<<<<< Updated upstream
=======
const moreFeatured: FeaturedModel[] = [
  { id: 8358, folder: "8358_Adobe_Creative_Cloud_All_Apps_1_Year_Subscription", label: "Adobe CC", subtitle: "Creative Suite" },
  { id: 9044, folder: "9044_SketchUp_-_The_3D_Modeling_Software", label: "SketchUp", subtitle: "3D Modeling" },
];

const microsoftSections: NavSection[] = [
  {
    title: "Microsoft Windows",
    subcategories: [
      { name: "Windows 11", filter: "Microsoft Windows 11" },
      { name: "Windows 10", filter: "Microsoft Windows 10" },
    ],
  },
  {
    title: "Microsoft Office",
    subcategories: [
      { name: "Office 365", filter: "Microsoft Office 365" },
      { name: "Office 2024", filter: "Microsoft Office 2024" },
      { name: "Office 2021", filter: "Microsoft Office 2021" },
      { name: "Office for Mac", filter: "Microsoft Office For MAC" },
    ],
  },
  {
    title: "Microsoft Servers",
    subcategories: [
      { name: "Windows Server 2025", filter: "Windows Server 2025" },
      { name: "Windows Server 2022", filter: "Windows Server 2022" },
      { name: "SharePoint Server", filter: "Share Point Server" },
      { name: "Exchange Server", filter: "Exchange Server" },
    ],
  },
  {
    title: "Microsoft Business",
    subcategories: [
      { name: "Dynamics 365", filter: "Dynamics 365" },
      { name: "Power BI", filter: "Microsoft Power BI" },
      { name: "Volume Licensing", filter: "Microsoft Volume Licensing" },
    ],
  },
  {
    title: "Office Applications",
    subcategories: [
      { name: "Microsoft Visio", filter: "Microsoft Visio" },
      { name: "Microsoft Project", filter: "Microsoft Project" },
      { name: "Visual Studio", filter: "Microsoft Visual Studio" },
    ],
  },
  {
    title: "SQL Server",
    subcategories: [
      { name: "SQL Server 2025", filter: "SQL Server 2025" },
      { name: "SQL Server 2022", filter: "SQL Server 2022" },
      { name: "SQL Server 2019", filter: "SQL Server 2019" },
      { name: "SQL Server 2017", filter: "SQL Server 2017" },
    ],
  },
];

const autodeskSections: NavSection[] = [
  {
    title: "By Year",
    subcategories: [
      { name: "Autodesk 2026", filter: "Autodesk 2026" },
      { name: "Autodesk 2025", filter: "Autodesk 2025" },
      { name: "Autodesk 2024", filter: "Autodesk 2024" },
    ],
  },
  {
    title: "Popular Products",
    subcategories: [
      { name: "AutoCAD", filter: "AutoCAD" },
      { name: "Revit", filter: "Revit" },
      { name: "Maya", filter: "Maya" },
      { name: "3ds Max", filter: "3ds Max" },
      { name: "Civil 3D", filter: "Civil 3D" },
      { name: "Inventor", filter: "Inventor" },
      { name: "Fusion 360", filter: "Fusion 360" },
      { name: "Navisworks", filter: "Naviswork" },
    ],
  },
  {
    title: "Collections",
    subcategories: [
      { name: "AEC Collection", filter: "AEC Collection 2025" },
      { name: "Architecture & Engineering", filter: "Architecture and Engineer" },
      { name: "Agencies & Freelancers", filter: "Agencies & Freelancers Software" },
    ],
  },
];

// ── Inline 3D Model Card ──
function NavModelCard({ model, onClick }: { model: FeaturedModel; onClick: () => void }) {
  const src = `${API_BASE}/models/${model.id}/${model.folder}/model.glb`;
  return (
    <button
      onClick={onClick}
      className="relative rounded-lg overflow-hidden border border-white/[0.06] bg-white/[0.02] hover:border-crimson/30 hover:bg-white/[0.05] transition-all duration-300 group/card cursor-pointer"
    >
      <div className="h-28 w-full relative">
        {/* @ts-ignore */}
        <model-viewer
          src={src}
          alt={model.label}
          camera-orbit="30deg 75deg 105%"
          field-of-view="30deg"
          interaction-prompt="none"
          shadow-intensity="0.3"
          exposure="1.1"
          auto-rotate
          auto-rotate-delay="0"
          rotation-per-second="30deg"
          style={{
            width: "100%",
            height: "100%",
            outline: "none",
            border: "none",
            ["--poster-color" as string]: "transparent",
            ["--progress-bar-color" as string]: "transparent",
          }}
        />
      </div>
      <div className="px-3 py-2 text-left">
        <div className="text-xs font-medium text-[#FEFEFE] group-hover/card:text-crimson transition-colors truncate">
          {model.label}
        </div>
        <div className="text-[10px] text-[#B1B2B3]/60">{model.subtitle}</div>
      </div>
    </button>
  );
}

// ── Hero Featured Card (gradient overlay style) ──
function FeaturedHeroCard({ model, onClick }: { model: FeaturedModel; onClick: () => void }) {
  const src = `${API_BASE}/models/${model.id}/${model.folder}/model.glb`;
  return (
    <button
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-md bg-gradient-to-br from-[#0a0b0c] to-[#060708] border border-white/[0.06] h-64 cursor-pointer group/hero text-left"
    >
      {/* 3D Model */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* @ts-ignore */}
        <model-viewer
          src={src}
          alt={model.label}
          camera-orbit="30deg 75deg 105%"
          field-of-view="30deg"
          interaction-prompt="none"
          shadow-intensity="0.3"
          exposure="1.1"
          auto-rotate
          auto-rotate-delay="0"
          rotation-per-second="30deg"
          style={{
            width: "100%",
            height: "100%",
            outline: "none",
            border: "none",
            ["--poster-color" as string]: "transparent",
            ["--progress-bar-color" as string]: "transparent",
          }}
        />
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/40 to-transparent z-10 pointer-events-none" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
        <span className="inline-block px-2 py-1 bg-crimson/20 backdrop-blur text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 rounded-sm text-crimson">
          Featured
        </span>
        <h4 className="font-serif text-lg leading-tight mb-1 text-[#FEFEFE]">
          {model.label}
        </h4>
        <p className="text-xs text-[#B1B2B3] mb-3">{model.subtitle}</p>
        <span className="text-xs border-b border-crimson/40 pb-0.5 inline-block text-crimson group-hover/hero:border-crimson transition-colors">
          View Product
        </span>
      </div>
    </button>
  );
}

>>>>>>> Stashed changes
const Header = () => {
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

<<<<<<< Updated upstream
            {/* Mega Menu */}
            <div className="mega-menu fixed left-4 right-4 top-16 max-w-[1200px] mx-auto bg-surface-card/95 backdrop-blur-2xl border border-theme shadow-premium-lg rounded-b-lg pt-8 pb-12 px-8 md:px-12 z-50 origin-top overflow-auto max-h-[80vh]">
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
=======
            {activeMenu === 'microsoft' && (
              <div
                className="fixed left-4 right-4 top-16 max-w-[1200px] mx-auto backdrop-blur-2xl border border-white/[0.1] shadow-premium-lg rounded-b-lg pt-6 pb-8 px-8 z-50 origin-top overflow-auto max-h-[80vh]"
                style={MEGA_MENU_STYLE}
              >
                <div className="flex gap-8">
                  {/* Categories — left side */}
                  <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-6">
                    {microsoftSections.map((section) => (
                      <div key={section.title}>
                        <span className="text-[10px] font-semibold text-crimson/80 uppercase tracking-[0.14em] mb-3 block">
                          {section.title}
                        </span>
                        <ul className="space-y-1.5">
                          {section.subcategories.map((sub) => (
                            <li key={sub.name}>
                              <button
                                onClick={() => handleCategoryClick(sub.filter)}
                                className="text-sm text-[#B1B2B3] hover:text-[#FEFEFE] hover:pl-1 transition-all duration-200 flex items-center gap-2 group/link w-full text-left"
                              >
                                <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0 text-crimson" />
                                {sub.name}
                              </button>
                      </li>
                    ))}
                  </ul>
                      </div>
                    ))}
                  </div>

                  {/* Featured Hero + small cards — right side */}
                  <div className="w-[340px] flex-shrink-0 border-l border-white/[0.06] pl-8 space-y-3">
                    <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-4 block">
                      Featured Products
                    </span>
                    {/* Hero card for first product */}
                    <FeaturedHeroCard
                      model={microsoftFeatured[0]}
                      onClick={() => handleModelClick(microsoftFeatured[0])}
                    />
                    {/* Smaller cards for remaining */}
                    <div className="grid grid-cols-2 gap-2">
                      {microsoftFeatured.slice(1).map((model) => (
                        <NavModelCard
                          key={model.id}
                          model={model}
                          onClick={() => handleModelClick(model)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs text-[#B1B2B3]/60">Browse all Microsoft products</span>
                  <button
                    onClick={() => handleBrandClick('Microsoft')}
                    className="text-xs text-crimson hover:text-crimson/80 flex items-center gap-1 transition-colors"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Autodesk ── */}
          <div
            className="group h-full flex items-center nav-item relative"
            onMouseEnter={() => setActiveMenu('autodesk')}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300 tracking-wide h-full flex items-center gap-1 px-3">
              <Box className="w-3.5 h-3.5 opacity-60" />
              Autodesk <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {activeMenu === 'autodesk' && (
              <div
                className="fixed left-4 right-4 top-16 max-w-[1100px] mx-auto backdrop-blur-2xl border border-white/[0.1] shadow-premium-lg rounded-b-lg pt-6 pb-8 px-8 z-50 origin-top overflow-auto max-h-[80vh]"
                style={MEGA_MENU_STYLE}
              >
                <div className="flex gap-8">
                  {/* Categories */}
                  <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-6">
                    {autodeskSections.map((section) => (
                      <div key={section.title}>
                        <span className="text-[10px] font-semibold text-crimson/80 uppercase tracking-[0.14em] mb-3 block">
                          {section.title}
                        </span>
                        <ul className="space-y-1.5">
                          {section.subcategories.map((sub) => (
                            <li key={sub.name}>
                              <button
                                onClick={() => handleCategoryClick(sub.filter)}
                                className="text-sm text-[#B1B2B3] hover:text-[#FEFEFE] hover:pl-1 transition-all duration-200 flex items-center gap-2 group/link w-full text-left"
                              >
                                <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0 text-crimson" />
                                {sub.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                        </div>
                    ))}
                  </div>

                  {/* Featured Hero + small cards */}
                  <div className="w-[340px] flex-shrink-0 border-l border-white/[0.06] pl-8 space-y-3">
                    <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-4 block">
                      Featured Products
                    </span>
                    <FeaturedHeroCard
                      model={autodeskFeatured[0]}
                      onClick={() => handleModelClick(autodeskFeatured[0])}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {autodeskFeatured.slice(1).map((model) => (
                        <NavModelCard
                          key={model.id}
                          model={model}
                          onClick={() => handleModelClick(model)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs text-[#B1B2B3]/60">Browse all Autodesk products</span>
                  <button
                    onClick={() => handleBrandClick('Autodesk')}
                    className="text-xs text-crimson hover:text-crimson/80 flex items-center gap-1 transition-colors"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── More (Adobe, SketchUp, etc.) ── */}
          <div
            className="group h-full flex items-center nav-item relative"
            onMouseEnter={() => setActiveMenu('more')}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300 tracking-wide h-full flex items-center gap-1 px-3">
              <Layers className="w-3.5 h-3.5 opacity-60" />
              More <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {activeMenu === 'more' && (
              <div
                className="fixed left-1/2 -translate-x-1/2 top-16 w-[480px] backdrop-blur-2xl border border-white/[0.1] shadow-premium-lg rounded-b-lg pt-5 pb-6 px-6 z-50 origin-top overflow-auto max-h-[80vh]"
                style={MEGA_MENU_STYLE}
              >
                <div className="flex gap-6">
                  {/* Links */}
                  <div className="flex-1">
                    <span className="text-[10px] font-semibold text-crimson/80 uppercase tracking-[0.14em] mb-3 block">
                      More Brands
                    </span>
                    <ul className="space-y-1.5">
                      <li>
                        <button
                          onClick={() => handleCategoryClick('Adobe')}
                          className="text-sm text-[#B1B2B3] hover:text-[#FEFEFE] hover:pl-1 transition-all duration-200 flex items-center gap-2 group/link w-full text-left"
>>>>>>> Stashed changes
                        >
                          {cat.name}
                          <ArrowRight className={`w-3 h-3 ${cat.active ? "text-crimson" : "opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0"}`} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

<<<<<<< Updated upstream
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
=======
                  {/* Featured cards */}
                  <div className="w-[200px] flex-shrink-0 space-y-3">
                    {moreFeatured.map((model) => (
                      <NavModelCard
                        key={model.id}
                        model={model}
                        onClick={() => handleModelClick(model)}
                      />
>>>>>>> Stashed changes
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
            <SearchBar />
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
