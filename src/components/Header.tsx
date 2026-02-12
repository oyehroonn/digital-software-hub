import { Search, User, ShoppingBag, ChevronDown, ArrowRight, LayoutGrid, PenTool, Box, ShieldCheck } from "lucide-react";

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
  return (
    <header className="fixed top-0 left-0 w-full z-50 transition-all duration-300 border-b border-transparent bg-background/80 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between relative">
        {/* Logo */}
        <a href="#" className="font-serif text-xl tracking-tight z-50 font-medium relative group">
          DSM.
          <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-foreground transition-all duration-300 group-hover:w-full" />
        </a>

        {/* Desktop Menu */}
        <nav className="hidden lg:flex items-center gap-8 h-full overflow-visible">
          <div className="group h-full flex items-center nav-item">
            <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors tracking-wide h-full flex items-center gap-1">
              Software <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {/* Mega Menu - positioned relative to the header container */}
            <div className="mega-menu fixed left-1/2 -translate-x-1/2 top-16 w-[90vw] max-w-[1200px] bg-white border border-border shadow-2xl rounded-b-xl pt-8 pb-12 px-12 z-50 origin-top">
              <div className="grid grid-cols-12 gap-8">
                {/* Categories */}
                <div className="col-span-3 border-r border-stone-100">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-6 block">Categories</span>
                  <ul className="space-y-3">
                    {categories.map((cat) => (
                      <li key={cat.name}>
                        <a
                          href="#"
                          className={`text-sm flex items-center justify-between transition-colors ${
                            cat.active
                              ? "text-foreground font-medium"
                              : "text-muted-foreground hover:text-cobalt group/link"
                          }`}
                        >
                          {cat.name}
                          <ArrowRight className={`w-3 h-3 ${cat.active ? "" : "opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0"}`} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Partner Showroom */}
                <div className="col-span-5 px-8">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-6 block">Official Partner Showroom</span>
                  <div className="grid grid-cols-2 gap-4">
                    {brands.map((brand) => (
                      <a key={brand.name} href="#" className="p-4 bg-stone-50 rounded hover:bg-stone-100 transition-colors group/brand">
                        <div className="flex items-center gap-2 mb-2">
                          <brand.icon className="w-4 h-4 text-muted-foreground group-hover/brand:text-cobalt" />
                          <span className="text-sm font-medium">{brand.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{brand.desc}</p>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Editorial Feature */}
                <div className="col-span-4 relative group cursor-pointer overflow-hidden rounded bg-stone-900 text-white p-6 flex flex-col justify-end h-64">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                  <img
                    src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop"
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700 ease-out z-0"
                    alt="Creative workspace"
                  />
                  <div className="relative z-20">
                    <span className="inline-block px-2 py-1 bg-white/20 backdrop-blur text-[10px] uppercase tracking-widest font-semibold mb-2 rounded-sm">Featured</span>
                    <h4 className="font-serif text-lg leading-tight mb-1">The Creative Suite 2025</h4>
                    <p className="text-xs text-stone-300 mb-3 line-clamp-2">Upgrade your workflow with the latest tools from Adobe.</p>
                    <span className="text-xs border-b border-white/40 pb-0.5 inline-block">Explore Collection</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Enterprise</a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Support</a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</a>
        </nav>

        {/* Icons */}
        <div className="flex items-center gap-5">
          <button className="text-foreground hover:opacity-70 transition-opacity"><Search className="w-5 h-5" strokeWidth={1.5} /></button>
          <a href="#" className="text-foreground hover:opacity-70 transition-opacity"><User className="w-5 h-5" strokeWidth={1.5} /></a>
          <a href="#" className="relative text-foreground hover:opacity-70 transition-opacity">
            <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-cobalt rounded-full" />
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
