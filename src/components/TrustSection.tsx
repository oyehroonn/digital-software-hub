import { ShieldCheck, Clock, Headphones, CreditCard, ArrowRight } from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    title: "Certified Authenticity",
    desc: "Direct partner status with Microsoft, Adobe, and Autodesk ensures 100% genuine keys that pass every audit.",
  },
  {
    icon: Clock,
    title: "Instant Concierge Delivery",
    desc: "No waiting. Receive your license keys and installation guides securely via email seconds after purchase.",
  },
  {
    icon: Headphones,
    title: "Technical Setup Support",
    desc: "Our specialists don't just sell; they help you install, activate, and troubleshoot deployment issues.",
  },
  {
    icon: CreditCard,
    title: "Secure Transactions",
    desc: "Encrypted checkout with purchase protection and full VAT invoicing for corporate compliance.",
  },
];

const TrustSection = () => {
  return (
    <section className="py-24 border-t border-border bg-white">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-5">
            <h2 className="font-serif text-4xl mb-6">
              Why the world's leading<br />companies trust DSM.
            </h2>
            <p className="text-muted-foreground font-light leading-relaxed mb-8">
              We aren't just a marketplace; we are your licensing compliance partner. From audit support to volume discounts, we handle the complexities of software procurement so you can focus on building.
            </p>
            <a href="#" className="text-sm font-medium border-b border-foreground pb-1 hover:text-cobalt hover:border-cobalt transition-colors inline-flex items-center gap-2">
              Read our story <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0 text-stone-700">
                  <f.icon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">{f.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
