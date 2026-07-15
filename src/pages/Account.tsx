/**
 * Account portal — /account
 * --------------------------
 * The member dashboard. Everything on this page is served by STABLE backends:
 *  - Licenses come from the Orders sheet via the Ecommerce Apps Script, scoped by
 *    the signed-in email (getLicenses). Any read failure degrades to an empty
 *    list — the page never breaks.
 *  - The insider opt-in and member discount are pure client preferences mirrored
 *    to the same Apps Script for the email cron to honour.
 *  - "Email me a reminder" routes through the local mail bridge and, if the
 *    bridge is down, parks the send in the offline queue for automatic retry.
 *
 * Signed-out visitors get a clean sign-in CTA instead of the dashboard.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  CircleAlert,
  Infinity as InfinityIcon,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAccount } from '@/hooks/useAccount';
import { useAccountDialog } from '@/components/account/AccountProvider';
import {
  daysUntil,
  getLicenses,
  isInsider,
  MEMBER_DISCOUNT_PCT,
  setInsiderOptIn,
  type License,
} from '@/lib/account';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';
import { track, STORE_NAME } from '@/lib/stable/analytics';

// Offline-resilient reminder email: never lose a member's request if the bridge
// is down — park it and retry on reconnect (same pattern as SmartCallback).
const REMINDER_QUEUE_KIND = 'renewal_reminder_email';
registerProcessor<{ args: SendEmailArgs }>(REMINDER_QUEUE_KIND, ({ args }) =>
  sendEmail(args).then(() => undefined),
);

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface StatusPill {
  label: string;
  className: string;
  icon: typeof BadgeCheck;
}

function statusFor(l: License): StatusPill {
  if (l.status === 'lifetime')
    return {
      label: 'Lifetime',
      className: 'bg-azure/10 text-azure border-azure/20',
      icon: InfinityIcon,
    };
  if (l.status === 'expired')
    return {
      label: 'Expired',
      className: 'bg-crimson/10 text-crimson border-crimson/20',
      icon: CircleAlert,
    };
  const days = daysUntil(l.expiresAt);
  if (days != null && days <= 30)
    return {
      label: `Renews in ${days}d`,
      className: 'bg-gold/10 text-gold border-gold/20',
      icon: CalendarClock,
    };
  return { label: 'Active', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: BadgeCheck };
}

export default function Account() {
  const { account, isMember, signOut } = useAccount();
  const { open } = useAccountDialog();

  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [insider, setInsider] = useState(false);
  const [reminderSent, setReminderSent] = useState<string | null>(null);

  const email = account?.email;

  const load = useCallback(() => {
    if (!email) return;
    setLoading(true);
    getLicenses(email)
      .then(setLicenses)
      .finally(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      return;
    }
    setInsider(isInsider(email));
    load();
    track({ event: 'account_portal_view', eventType: 'page', metadata: { email } });
  }, [email, load]);

  const summary = useMemo(() => {
    const active = licenses.filter((l) => l.status !== 'expired').length;
    const expiring = licenses.filter((l) => {
      const d = daysUntil(l.expiresAt);
      return l.status === 'active' && d != null && d <= 30;
    });
    return { total: licenses.length, active, expiring };
  }, [licenses]);

  const onToggleInsider = (next: boolean) => {
    setInsider(next);
    setInsiderOptIn(next, email);
  };

  const onEmailReminder = (l: License) => {
    if (!email) return;
    const days = daysUntil(l.expiresAt);
    const args: SendEmailArgs = {
      to: email,
      subject: `Renewal reminder: ${l.product}`,
      body:
        `Hi${account?.displayName ? ` ${account.displayName}` : ''},\n\n` +
        `This is your reminder that your ${STORE_NAME} license for ${l.product} ` +
        (l.expiresAt
          ? `expires on ${fmtDate(l.expiresAt)}${days != null ? ` (in ${days} days)` : ''}.\n\n`
          : `is due for review.\n\n`) +
        `Renew now and keep your standing ${MEMBER_DISCOUNT_PCT}% member discount:\n` +
        `https://digitalsoftwaremarket.com/store\n\n` +
        `— The ${STORE_NAME} team`,
    };
    // Best-effort send; queue on bridge failure so the reminder is never lost.
    sendEmail(args).catch(() => enqueue(REMINDER_QUEUE_KIND, { args }));
    track({ event: 'renewal_reminder_requested', eventType: 'custom', metadata: { product: l.product } });
    setReminderSent(l.product);
    window.setTimeout(() => setReminderSent(null), 4000);
  };

  // ── Signed-out state ─────────────────────────────────────────────────────────
  if (!isMember) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="mx-auto flex max-w-[1600px] flex-col items-center px-6 pt-40 pb-32 text-center">
          <div className="mb-3 inline-flex items-center gap-2 text-crimson">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Free DSM Membership
            </span>
          </div>
          <h1 className="font-serif text-4xl text-[#FEFEFE]">Your member dashboard</h1>
          <p className="mt-3 max-w-md text-[#B1B2B3]">
            Sign in or create your free account to see every license you own, track renewals and
            expiry dates, and unlock your standing {MEMBER_DISCOUNT_PCT}% member price.
          </p>
          <Button
            onClick={() => open('/account')}
            className="mt-8 bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
            size="lg"
          >
            Sign in / Create free account
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Signed-in dashboard ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="mx-auto max-w-[1200px] px-6 pt-32 pb-24">
        {/* Header row */}
        <div className="mb-10 flex flex-col gap-4 border-b border-white/[0.06] pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-crimson/20 bg-crimson/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-crimson">
              <BadgeCheck className="h-3.5 w-3.5" /> DSM Member · {MEMBER_DISCOUNT_PCT}% off
            </div>
            <h1 className="font-serif text-3xl text-[#FEFEFE] md:text-4xl">
              Welcome{account?.displayName ? `, ${account.displayName}` : ' back'}
            </h1>
            <p className="mt-1 text-sm text-[#B1B2B3]">
              {account?.email}
              {account?.verified ? (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> verified
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-white/10 text-[#B1B2B3] hover:text-[#FEFEFE]"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-[#B1B2B3] hover:text-[#FEFEFE]"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatTile label="Licenses" value={summary.total} icon={Tag} />
          <StatTile label="Active" value={summary.active} icon={BadgeCheck} />
          <StatTile
            label="Expiring soon"
            value={summary.expiring.length}
            icon={CalendarClock}
            accent={summary.expiring.length > 0}
          />
        </div>

        {/* Expiring-soon strip */}
        {summary.expiring.length > 0 && (
          <div className="mb-8 rounded-xl border border-gold/20 bg-gold/[0.06] p-5">
            <div className="mb-1 flex items-center gap-2 text-gold">
              <CalendarClock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                Renewals due soon
              </span>
            </div>
            <p className="text-sm text-[#B1B2B3]">
              {summary.expiring.length === 1
                ? `Your ${summary.expiring[0].product} license`
                : `${summary.expiring.length} of your licenses`}{' '}
              renew within 30 days. Keep your member discount by renewing early.
            </p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Licenses table */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#FEFEFE]">
              Your licenses
            </h2>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]"
                  />
                ))}
              </div>
            ) : licenses.length === 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                <p className="text-[#B1B2B3]">
                  No licenses are linked to <strong className="text-[#FEFEFE]">{account?.email}</strong> yet.
                </p>
                <p className="mt-1 text-sm text-[#B1B2B3]/70">
                  Purchases made with this email will appear here automatically.
                </p>
                <Button
                  asChild
                  className="mt-5 bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
                >
                  <a href="/store">Browse the store</a>
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {licenses.map((l, i) => {
                  const pill = statusFor(l);
                  const showReminder = l.status === 'active' && l.expiresAt;
                  return (
                    <li
                      key={`${l.product}-${l.purchasedAt}-${i}`}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/10"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium text-[#FEFEFE]">{l.product}</h3>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#B1B2B3]">
                            <span>Purchased {fmtDate(l.purchasedAt)}</span>
                            <span>
                              {l.expiresAt ? `Expires ${fmtDate(l.expiresAt)}` : 'No expiry'}
                            </span>
                            {l.quantity ? <span>Qty {l.quantity}</span> : null}
                            {l.orderRef ? <span className="opacity-60">Ref {l.orderRef}</span> : null}
                          </div>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${pill.className}`}
                        >
                          <pill.icon className="h-3 w-3" /> {pill.label}
                        </span>
                      </div>
                      {showReminder && (
                        <div className="mt-3 flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEmailReminder(l)}
                            className="h-8 border-white/10 text-xs text-[#B1B2B3] hover:text-[#FEFEFE]"
                          >
                            <Mail className="mr-1.5 h-3.5 w-3.5" /> Email me a reminder
                          </Button>
                          {reminderSent === l.product && (
                            <span className="text-xs text-emerald-400">Reminder sent</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Perks sidebar */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center gap-2 text-[#FEFEFE]">
                <Bell className="h-4 w-4 text-crimson" />
                <h3 className="text-sm font-semibold">Insider emails</h3>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-[#B1B2B3]">
                Get new-launch alerts and automatic renewal reminders. Unsubscribe anytime.
              </p>
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-sm text-[#B1B2B3]">
                  {insider ? 'You’re subscribed' : 'Off'}
                </span>
                <Switch
                  checked={insider}
                  onCheckedChange={onToggleInsider}
                  className="data-[state=checked]:bg-crimson"
                />
              </label>
            </div>

            <div className="rounded-xl border border-crimson/20 bg-gradient-to-br from-crimson/10 to-transparent p-5">
              <div className="mb-2 flex items-center gap-2 text-crimson">
                <Sparkles className="h-4 w-4" />
                <h3 className="text-sm font-semibold text-[#FEFEFE]">Member price</h3>
              </div>
              <p className="text-3xl font-serif text-[#FEFEFE]">{MEMBER_DISCOUNT_PCT}% off</p>
              <p className="mt-1 text-xs text-[#B1B2B3]">
                Applied automatically to every license in the store while you’re signed in.
              </p>
              <Button asChild className="mt-4 w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark">
                <a href="/store">Shop with member pricing</a>
              </Button>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number;
  icon: typeof Tag;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent
          ? 'border-gold/20 bg-gold/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent ? 'text-gold' : 'text-[#B1B2B3]'}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#B1B2B3]">
          {label}
        </span>
      </div>
      <p className="font-serif text-3xl text-[#FEFEFE]">{value}</p>
    </div>
  );
}
