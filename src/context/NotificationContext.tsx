import { createContext, useContext } from 'react';

export type NotificationSeverity = 'warning' | 'error';

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationContextType {
  notifications: AppNotification[];
  hasUnread: boolean;
  markAllSeen: () => void;
  refresh: () => void;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
