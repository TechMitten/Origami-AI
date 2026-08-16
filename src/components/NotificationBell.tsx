import React, { useState } from 'react';
import { Bell, AlertCircle, AlertTriangle } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

export const NotificationBell: React.FC = () => {
  const { notifications, hasUnread, markAllSeen } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    setIsOpen((current) => {
      const next = !current;
      if (next) markAllSeen();
      return next;
    });
  };

  const closePanel = () => setIsOpen(false);

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className="relative p-2 rounded-lg text-white/70 bg-white/5 transition-all hover:text-white hover:bg-white/10"
        title="Notifications"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-[#0a0a0b]" />
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[-1] cursor-default"
          onClick={closePanel}
        />
      )}

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#18181b] py-1 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right z-60">
          <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white/40">
            Notifications
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-4 text-sm text-white/50">No issues — everything looks good.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => {
                const Icon = notification.severity === 'error' ? AlertCircle : AlertTriangle;
                const iconColor = notification.severity === 'error' ? 'text-red-400' : 'text-amber-400';

                return (
                  <div key={notification.id} className="px-4 py-3 border-t border-white/5 first:border-t-0">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{notification.title}</p>
                        <p className="text-sm text-white/60 mt-0.5">{notification.message}</p>
                        {notification.actionLabel && notification.onAction && (
                          <button
                            onClick={() => {
                              notification.onAction?.();
                              closePanel();
                            }}
                            className="mt-2 text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            {notification.actionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
