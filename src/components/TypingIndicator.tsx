import { useState, useEffect } from 'react';
import { Search, Sparkles, FileText, BarChart3, Package } from 'lucide-react';

interface TypingIndicatorProps {
  /** 'global' for the main chat, 'product' for product-specific chat */
  variant?: 'global' | 'product';
  /** Compact mode for smaller chat areas (ProductModal) */
  compact?: boolean;
}

const GLOBAL_STEPS = [
  { icon: Search, text: 'Searching catalog…', color: 'text-blue-400' },
  { icon: Package, text: 'Matching products…', color: 'text-amber-400' },
  { icon: Sparkles, text: 'Crafting response…', color: 'text-crimson' },
];

const PRODUCT_STEPS = [
  { icon: FileText, text: 'Reading product data…', color: 'text-blue-400' },
  { icon: BarChart3, text: 'Analyzing details…', color: 'text-amber-400' },
  { icon: Sparkles, text: 'Generating answer…', color: 'text-crimson' },
];

export default function TypingIndicator({ variant = 'global', compact = false }: TypingIndicatorProps) {
  const steps = variant === 'product' ? PRODUCT_STEPS : GLOBAL_STEPS;
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        return prev; // Stay on the last step
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [steps.length]);

  const step = steps[currentStep];
  const Icon = step.icon;

  if (compact) {
    return (
      <div className="flex justify-start animate-in fade-in duration-200">
        <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl px-3.5 py-2.5 text-xs text-[#B1B2B3]">
          <div className="flex items-center gap-2">
            <Icon className={`w-3 h-3 ${step.color} animate-pulse`} />
            <span className="text-[10px] transition-all duration-300">{step.text}</span>
          </div>
          {/* Step dots */}
          <div className="flex gap-1 mt-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-[2px] rounded-full transition-all duration-500 ${
                  i <= currentStep
                    ? 'bg-crimson/60 w-4'
                    : 'bg-white/[0.08] w-2'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-in fade-in duration-200">
      <div className="bg-white/[0.04] border border-white/[0.05] rounded-lg px-4 py-3 text-sm text-[#B1B2B3] min-w-[200px]">
        {/* Current step */}
        <div className="flex items-center gap-2.5">
          <div className={`${step.color} transition-colors duration-300`}>
            <Icon className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span className="text-xs font-medium transition-all duration-300">{step.text}</span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mt-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`h-[3px] rounded-full transition-all duration-500 flex-1 ${
                i < currentStep
                  ? 'bg-crimson/50'
                  : i === currentStep
                    ? 'bg-crimson/70 animate-pulse'
                    : 'bg-white/[0.06]'
              }`}
            />
          ))}
        </div>

        {/* Completed steps (faded) */}
        {currentStep > 0 && (
          <div className="mt-2 space-y-0.5">
            {steps.slice(0, currentStep).map((s, i) => {
              const PrevIcon = s.icon;
              return (
                <div key={i} className="flex items-center gap-2 text-[10px] text-[#B1B2B3]/40">
                  <PrevIcon className="w-2.5 h-2.5" />
                  <span className="line-through">{s.text.replace('…', '')}</span>
                  <span className="text-green-500/60">✓</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

