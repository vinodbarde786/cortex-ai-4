import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, Zap, XCircle } from 'lucide-react';
import { supabase, type Trade, type ClientUpdate } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'critical' | 'trade';
}

export default function RealtimeToast() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => removeToast(id), 8000);
  }, [removeToast]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('admin-control-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trades', filter: `client_id=eq.${user.id}` },
        (payload) => {
          const t = payload.new as Trade;
          const directionLabel = t.direction === 'long' ? 'Buy (Long)' : 'Sell (Short)';
          const toast: Omit<ToastItem, 'id'> = {
            title: 'Master Admin Executed a Trade',
            message: `${t.coin} ${directionLabel} — ${t.quantity.toFixed(4)} @ $${Number(t.entry_price).toLocaleString()} (${t.market_type}, ${t.leverage}x)`,
            severity: 'trade',
          };
          addToast(toast);
          console.log('[Realtime] New trade from admin:', t);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_updates', filter: `client_id=eq.${user.id}` },
        (payload) => {
          const u = payload.new as ClientUpdate;
          const toast: Omit<ToastItem, 'id'> = {
            title: u.title,
            message: u.message,
            severity: u.severity as ToastItem['severity'],
          };
          addToast(toast);
          console.log('[Realtime] New client update from admin:', u);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trades', filter: `client_id=eq.${user.id}` },
        (payload) => {
          const t = payload.new as Trade;
          if (t.status !== 'open') {
            const toast: Omit<ToastItem, 'id'> = {
              title: 'Trade Status Updated',
              message: `${t.coin} position ${t.status === 'closed_tp' ? 'closed (Take Profit hit)' : t.status === 'closed_sl' ? 'closed (Stop Loss hit)' : 'cancelled'} by admin.`,
              severity: t.status === 'closed_tp' ? 'success' : 'warning',
            };
            addToast(toast);
            console.log('[Realtime] Trade updated by admin:', t);
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[120] flex flex-col gap-3 max-w-sm pointer-events-none">
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const config = {
    success: { icon: CheckCircle2, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/30', glow: 'neon-glow-green' },
    warning: { icon: AlertTriangle, color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/30', glow: 'neon-glow-amber' },
    critical: { icon: XCircle, color: 'text-neon-red', bg: 'bg-neon-red/10', border: 'border-neon-red/30', glow: 'neon-glow-red' },
    info: { icon: Info, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', glow: 'neon-glow-cyan' },
    trade: { icon: Zap, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/30', glow: 'neon-glow-green' },
  };

  const c = config[toast.severity] ?? config.info;
  const Icon = c.icon;

  return (
    <div
      className={`glass-strong ${c.glow} p-4 pr-6 flex items-start gap-3 pointer-events-auto animate-slide-up border ${c.border} rounded-2xl`}
    >
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.border} border flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-bold text-white">{toast.title}</p>
          {toast.severity === 'trade' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-neon-green/15 text-neon-green border border-neon-green/30">
              LIVE
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{toast.message}</p>
      </div>
      <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
