import { useState } from "react";
import { Instagram, Twitter, Linkedin, Youtube, ArrowRight, Check } from "lucide-react";
import { captureLead } from "@/lib/captureLead";
import { track } from "@/lib/stable/analytics";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Footer newsletter signup. Every email entered here is captured as a lead
 * (source: "newsletter") into the Ecommerce Apps Script so it appears in the
 * admin Customers view, in addition to the local subscribe confirmation.
 */
const NewsletterSignup = () => {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    track({ event: "newsletter_signup", eventType: "ecommerce", elementText: value });
    // Await the lead write so it lands before the form swaps to the confirmation.
    await captureLead({
      email: value,
      source: "newsletter",
      productName: "Newsletter signup",
      notes: "Subscribed to DSM updates from the footer.",
    });
    setDone(true);
    setEmail("");
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-crimson/30 bg-crimson/[0.06] px-4 py-3 text-sm text-[#FEFEFE]">
        <Check className="h-4 w-4 shrink-0 text-crimson" aria-hidden />
        You&apos;re subscribed — watch your inbox for genuine-license deals & launches.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <div className="flex-1">
        <label htmlFor="footer-newsletter" className="sr-only">
          Email address
        </label>
        <input
          id="footer-newsletter"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/50 focus:border-crimson/50 focus:outline-none focus:ring-1 focus:ring-crimson/40"
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-crimson px-5 py-2.5 text-sm font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
      >
        Subscribe
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
};

const Footer = () => {
  return (
    <footer className="bg-surface-dark text-muted-foreground py-20 relative">
      <div className="absolute top-0 left-0 right-0 section-divider-red" />

      <div className="max-w-[1600px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          <div>
            <div className="mb-6">
              <img 
                src="/dsm-white.png" 
                alt="DSM" 
                className="h-10 w-auto"
              />
            </div>
            <p className="text-sm font-light mb-6 max-w-xs text-[#B1B2B3]/80">
              The premier digital showroom for genuine software licensing. Empowering creators and enterprises since 1994.
            </p>
            <div className="flex gap-4">
              <a
                href="https://www.instagram.com/digitalsoftwaremarket/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"
                aria-label="DSM Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://x.com/digitalsoftwaremarket"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"
                aria-label="DSM X (Twitter)"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="https://www.linkedin.com/company/digitalsoftwaremarket"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"
                aria-label="DSM LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a
                href="https://www.youtube.com/@digitalsoftwaremarket"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B1B2B3]/60 hover:text-crimson transition-all duration-300 hover:scale-110"
                aria-label="DSM YouTube"
              >
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-[#FEFEFE] text-sm font-semibold uppercase tracking-[0.14em] mb-6">Shop</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Microsoft Office</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Windows Systems</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Adobe Creative Cloud</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Antivirus & Security</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Server Solutions</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#FEFEFE] text-sm font-semibold uppercase tracking-[0.14em] mb-6">Support</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="/support" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Help Center</a></li>
              <li><a href="/support#faq-activation" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Activation Guides</a></li>
              <li><a href="/account" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Order Status</a></li>
              <li><a href="/support#faq-refunds" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Refund Policy</a></li>
              <li><a href="/support" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Contact Support</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#FEFEFE] text-sm font-semibold uppercase tracking-[0.14em] mb-6">Legal</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Terms of Service</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Privacy Policy</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Cookie Policy</a></li>
              <li><a href="/store" className="text-[#B1B2B3]/70 hover:text-crimson transition-colors duration-300">Reseller Certificate</a></li>
            </ul>
          </div>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-6 rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 md:grid-cols-2 md:items-center md:p-8">
          <div>
            <h4 className="text-[#FEFEFE] text-lg font-semibold">Stay in the loop</h4>
            <p className="mt-1.5 text-sm font-light text-[#B1B2B3]/80 max-w-sm">
              Genuine-license deals, new launches and renewal reminders — straight to your inbox. No spam, unsubscribe anytime.
            </p>
          </div>
          <NewsletterSignup />
        </div>

        <div className="border-t border-white/[0.04] pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-[#B1B2B3]/50">&copy; 2026 Digital Software Market. All rights reserved.</p>
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
