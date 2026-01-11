
import { createContext, useContext, type ReactNode } from 'react';
import type { ModalType } from '../components/Modal';

export interface ModalOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  type?: ModalType;
}

interface ModalContextType {
  showAlert: (message: ReactNode, options?: ModalOptions) => Promise<void>;
  showConfirm: (message: ReactNode, options?: ModalOptions) => Promise<boolean>;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
