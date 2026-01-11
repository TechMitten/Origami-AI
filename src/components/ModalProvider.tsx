
import React, { useState, useCallback, type ReactNode } from 'react';
import { Modal, type ModalType } from './Modal';
import { ModalContext } from '../context/ModalContext';

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: ModalType;
    message: ReactNode;
    title?: string;
    confirmText?: string;
    cancelText?: string;
    resolve?: (value: unknown) => void;
    isConfirmation?: boolean;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showAlert = useCallback((message: ReactNode, options?: { title?: string; confirmText?: string; type?: ModalType }) => {
    return new Promise<void>((resolve) => {
      setModalState({
        isOpen: true,
        message,
        type: options?.type || 'info',
        title: options?.title,
        confirmText: options?.confirmText || 'OK',
        isConfirmation: false,
        resolve: () => {
          setModalState(prev => ({ ...prev, isOpen: false }));
          resolve();
        }
      });
    });
  }, []);

  const showConfirm = useCallback((message: ReactNode, options?: { title?: string; confirmText?: string; cancelText?: string; type?: ModalType }) => {
    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        message,
        type: options?.type || 'confirm',
        title: options?.title,
        confirmText: options?.confirmText || 'Confirm',
        cancelText: options?.cancelText || 'Cancel',
        isConfirmation: true,
        resolve: (confirmed: unknown) => {
          setModalState(prev => ({ ...prev, isOpen: false }));
          resolve(confirmed as boolean);
        }
      });
    });
  }, []);

  const handleConfirm = () => {
    if (modalState.resolve) {
      if (modalState.isConfirmation) {
         modalState.resolve(true);
      } else {
         modalState.resolve(undefined);
      }
    }
  };

  const handleCancel = () => {
    if (modalState.resolve) {
      if (modalState.isConfirmation) {
        modalState.resolve(false);
      } else {
        // Should not really happen for alerts as they don't have cancel, but just in case
        modalState.resolve(undefined);
      }
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <Modal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ModalContext.Provider>
  );
};
