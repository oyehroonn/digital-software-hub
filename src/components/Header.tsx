import { User, ShoppingBag, ChevronDown, ChevronRight, ArrowRight, Box, Monitor, Layers } from "lucide-react";
import SearchBar from "./SearchBar";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useState } from "react";
import "@google/model-viewer";

// ── API base for model URLs ──
const API_BASE = import.meta.env.VITE_API_BASE || 'https://aidsm.techrealm.ai';

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
];

const autodeskFeatured: FeaturedModel[] = [
  { id: 8721, folder: "8721_AutoCad_2026_Trusted_by_millions_built_to_accelerate_your_cr", label: "AutoCAD 2026", subtitle: "Design & Draft" },
  { id: 8698, folder: "8698_Revit_2026_BIM_software_to_design_and_make_anything_Yearly_S", label: "Revit 2026", subtitle: "BIM Software" },
  { id: 8694, folder: "8694_Maya_2026_Create_expansive_worlds_complex_characters_and_daz", label: "Maya 2026", subtitle: "3D Animation" },
];

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

const Header = () => {
  const navigate = useNavigate();
  const { setFilters, setSearchQuery, openProduct } = useApp();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const handleCategoryClick = (filter: string) => {
    setFilters({ category: [filter], brand: [], licenseType: [] });
    setSearchQuery('');
    navigate('/store');
    setActiveMenu(null);
  };

  const handleBrandClick = (brand: string) => {
    setFilters({ brand: [brand], category: [], licenseType: [] });
    setSearchQuery('');
    navigate('/store');
    setActiveMenu(null);
  };

  const handleModelClick = (model: FeaturedModel) => {
    openProduct(String(model.id));
    setActiveMenu(null);
  };

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
        <nav className="hidden lg:flex items-center gap-1 h-full overflow-visible">
          {/* ── Microsoft ── */}
          <div
            className="group h-full flex items-center nav-item relative"
            onMouseEnter={() => setActiveMenu('microsoft')}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300 tracking-wide h-full flex items-center gap-1 px-3">
              <Monitor className="w-3.5 h-3.5 opacity-60" />
              Microsoft <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {activeMenu === 'microsoft' && (
              <div className="fixed left-4 right-4 top-16 max-w-[1200px] mx-auto bg-surface-card/98 backdrop-blur-2xl border border-theme shadow-premium-lg rounded-b-lg pt-6 pb-8 px-8 z-50 origin-top">
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

                  {/* 3D Models — right side */}
                  <div className="w-[340px] flex-shrink-0 border-l border-white/[0.06] pl-8">
                    <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-4 block">
                      Featured Products
                    </span>
                    <div className="grid grid-cols-1 gap-3">
                      {microsoftFeatured.map((model) => (
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
              <div className="fixed left-4 right-4 top-16 max-w-[1100px] mx-auto bg-surface-card/98 backdrop-blur-2xl border border-theme shadow-premium-lg rounded-b-lg pt-6 pb-8 px-8 z-50 origin-top">
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

                  {/* 3D Models */}
                  <div className="w-[340px] flex-shrink-0 border-l border-white/[0.06] pl-8">
                    <span className="text-[10px] font-semibold text-[#B1B2B3]/60 uppercase tracking-[0.14em] mb-4 block">
                      Featured Products
                    </span>
                    <div className="grid grid-cols-1 gap-3">
                      {autodeskFeatured.map((model) => (
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
              <div className="fixed left-1/2 -translate-x-1/2 top-16 w-[420px] bg-surface-card/98 backdrop-blur-2xl border border-theme shadow-premium-lg rounded-b-lg pt-5 pb-6 px-6 z-50 origin-top">
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
                        >
                          <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0 text-crimson" />
                          Adobe Creative Cloud
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => handleCategoryClick('SketchUp & V-Ray')}
                          className="text-sm text-[#B1B2B3] hover:text-[#FEFEFE] hover:pl-1 transition-all duration-200 flex items-center gap-2 group/link w-full text-left"
                        >
                          <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0 text-crimson" />
                          SketchUp & V-Ray
                        </button>
                      </li>
                    </ul>
                  </div>

                  {/* 3D Models */}
                  <div className="w-[160px] flex-shrink-0 space-y-3">
                    {moreFeatured.map((model) => (
                      <NavModelCard
                        key={model.id}
                        model={model}
                        onClick={() => handleModelClick(model)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Link to="/store" className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300 px-3">Store</Link>
          <a href="#" className="text-sm font-medium text-[#B1B2B3] hover:text-crimson transition-colors duration-300 px-3">Support</a>
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
