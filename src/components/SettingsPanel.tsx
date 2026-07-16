import { Settings, X, Sun, Moon, Sparkles, MessagesSquare, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';

/** A single on/off row. */
function Toggle({
  icon,
  label,
  hint,
  on,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-crimson">{icon}</span>
        <label className="text-sm font-medium text-foreground-primary">{label}</label>
      </div>
      <p className="text-xs text-[#B1B2B3]/70">{hint}</p>
      <button
        onClick={() => onChange(!on)}
        className={`w-full h-10 rounded-md border transition-all ${
          on
            ? 'bg-crimson/20 border-crimson/30 text-crimson'
            : 'bg-white/[0.03] border-white/[0.06] text-[#B1B2B3] hover:border-white/[0.12]'
        }`}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}

export default function SettingsPanel() {
  const { state, setMarketingMode, setTheme, setHideAvatar, setHideConcierge } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle button — sits ABOVE the bottom-left ordering-avatar FAB so they
          never overlap; bottom-right is left free for the concierge bubble. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 left-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-theme bg-surface-card text-foreground-primary shadow-premium-lg transition-all hover:scale-110 hover:border-crimson/30"
        aria-label="Site settings"
        title="Site settings"
      >
        <Settings className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="fixed bottom-40 left-6 z-50 max-h-[70vh] w-80 space-y-6 overflow-y-auto rounded-lg border border-theme bg-surface-card p-6 shadow-premium-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-[#FEFEFE]">Settings</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-sm text-[#B1B2B3] transition-colors hover:bg-white/[0.06] hover:text-crimson"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Marketing Mode */}
          <Toggle
            icon={<Sparkles className="h-4 w-4" />}
            label="Marketing Mode"
            hint={
              state.marketingMode
                ? 'Full website experience is enabled.'
                : 'Only the chatbot interface is visible.'
            }
            on={state.marketingMode}
            onChange={setMarketingMode}
          />

          {/* Hide the floating icons */}
          <Toggle
            icon={<UserRound className="h-4 w-4" />}
            label="Hide ordering avatar"
            hint="Hide the bottom-left members ordering-avatar button."
            on={state.hideAvatar}
            onChange={setHideAvatar}
          />
          <Toggle
            icon={<MessagesSquare className="h-4 w-4" />}
            label="Hide chat concierge"
            hint="Hide the bottom-right AI chat bubble."
            on={state.hideConcierge}
            onChange={setHideConcierge}
          />

          {/* Theme */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {state.theme === 'dark' ? (
                <Moon className="h-4 w-4 text-crimson" />
              ) : (
                <Sun className="h-4 w-4 text-crimson" />
              )}
              <label className="text-sm font-medium text-[#FEFEFE]">Theme</label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-md border transition-all ${
                  state.theme === 'light'
                    ? 'bg-crimson/20 border-crimson/30 text-crimson'
                    : 'bg-white/[0.03] border-white/[0.06] text-[#B1B2B3] hover:border-white/[0.12]'
                }`}
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-md border transition-all ${
                  state.theme === 'dark'
                    ? 'bg-crimson/20 border-crimson/30 text-crimson'
                    : 'bg-white/[0.03] border-white/[0.06] text-[#B1B2B3] hover:border-white/[0.12]'
                }`}
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
