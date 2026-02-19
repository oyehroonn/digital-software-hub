import { Settings, X, Sun, Moon, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from './ui/button';

export default function SettingsPanel() {
  const { state, setMarketingMode, setTheme } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-surface-card border border-theme hover:border-crimson/30 text-foreground-primary shadow-premium-lg flex items-center justify-center transition-all hover:scale-110"
        aria-label="Open settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <div className="fixed bottom-24 left-6 z-50 w-80 bg-surface-card border border-theme rounded-lg shadow-premium-lg p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-[#FEFEFE]">Settings</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-sm text-[#B1B2B3] hover:text-crimson hover:bg-white/[0.06] transition-colors"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Marketing Mode Toggle */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-crimson" />
              <label className="text-sm font-medium text-foreground-primary">Marketing Mode</label>
            </div>
            <p className="text-xs text-[#B1B2B3]/70">
              {state.marketingMode
                ? 'Full website experience is enabled'
                : 'Only chatbot interface is visible'}
            </p>
            <button
              onClick={() => setMarketingMode(!state.marketingMode)}
              className={`w-full h-10 rounded-md border transition-all ${
                state.marketingMode
                  ? 'bg-crimson/20 border-crimson/30 text-crimson'
                  : 'bg-white/[0.03] border-white/[0.06] text-[#B1B2B3] hover:border-white/[0.12]'
              }`}
            >
              {state.marketingMode ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Theme Toggle */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {state.theme === 'dark' ? (
                <Moon className="w-4 h-4 text-crimson" />
              ) : (
                <Sun className="w-4 h-4 text-crimson" />
              )}
              <label className="text-sm font-medium text-[#FEFEFE]">Theme</label>
            </div>
            <p className="text-xs text-[#B1B2B3]/70">
              Switch between light and dark mode
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 h-10 rounded-md border transition-all flex items-center justify-center gap-2 ${
                  state.theme === 'light'
                    ? 'bg-crimson/20 border-crimson/30 text-crimson'
                    : 'bg-white/[0.03] border-white/[0.06] text-[#B1B2B3] hover:border-white/[0.12]'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 h-10 rounded-md border transition-all flex items-center justify-center gap-2 ${
                  state.theme === 'dark'
                    ? 'bg-crimson/20 border-crimson/30 text-crimson'
                    : 'bg-white/[0.03] border-white/[0.06] text-[#B1B2B3] hover:border-white/[0.12]'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

