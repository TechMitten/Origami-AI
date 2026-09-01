import React, { useState } from 'react';
import { User, Mail, Calendar, ShieldCheck, LogOut, Rocket, Trash2, AlertTriangle } from 'lucide-react';
import { Footer } from '../components/Footer';
import backgroundImage from '../assets/images/background.jpg';
import { PageHeader } from '../components/PageHeader';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import { deleteUser } from 'firebase/auth';

export const AccountOverviewPage: React.FC = () => {
  usePageMeta({
    title: 'Account Overview — Origami AI',
    description: 'View your account details and manage your profile.',
    path: '/account',
  });

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.")) {
      return;
    }
    
    setIsDeleting(true);
    try {
      if (user) {
        await deleteUser(user);
        navigate('/');
      }
    } catch (error: any) {
      console.error("Error deleting user:", error);
      if (error.code === 'auth/requires-recent-login') {
        window.alert("For security reasons, you must have signed in recently to delete your account. Please sign out, log back in, and try again.");
      } else {
        window.alert("An error occurred while deleting your account: " + (error.message || "Unknown error"));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#121215] text-white pt-8 pb-2 flex flex-col items-center justify-center px-4 sm:px-8">
        <PageHeader title="Account Overview" showBack showGithub={false} showHelp={false} showSettings={false} />
        <div className="text-center mt-20 flex flex-col items-center flex-grow">
          <h2 className="text-2xl font-bold text-white mb-4">You are not logged in</h2>
          <button onClick={() => navigate('/')} className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 rounded-xl text-white font-medium transition-colors">
            Return to Home
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121215] text-white pt-8 pb-2 flex flex-col px-4 sm:px-8">
      {/* Background Image */}
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 w-full h-lvh object-cover opacity-40 blur-[2px] brightness-75 scale-105"
      />

      <PageHeader
        title="Account Overview"
        showBack
        showGithub={false}
        showHelp={false}
        showSettings={false}
      />

      {/* Main Content */}
      <main className="mx-auto max-w-4xl w-full mb-8 animate-slide-up flex-grow">
        <div className="glass rounded-3xl border border-white/10 p-8 sm:p-12 mb-8 neon-border">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-cyan-500/20 rounded-2xl border border-cyan-500/30">
              <User className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Account Details</h1>
              <p className="text-white/60">Manage your Origami AI profile</p>
            </div>
          </div>

          <div className="space-y-6 mt-8">
            {/* Email */}
            <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Email Address</h3>
              </div>
              <p className="text-white/80 ml-8">{user.email}</p>
            </div>

            {/* User ID */}
            <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Account ID</h3>
              </div>
              <p className="text-white/80 ml-8 text-sm font-mono">{user.uid}</p>
            </div>

            {/* Creation Time */}
            {user.metadata?.creationTime && (
              <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-white">Account Created</h3>
                </div>
                <p className="text-white/80 ml-8">
                  {new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="mt-12 flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all focus:ring-2 focus:ring-cyan-500/50"
            >
              <Rocket className="w-5 h-5" />
              Let's get started
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-all"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>

          {/* Danger Zone */}
          <div className="mt-12 border-t border-red-500/20 pt-8">
            <h3 className="text-xl font-bold text-red-400 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </h3>
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-white font-medium mb-1">Delete Account</h4>
                <p className="text-sm text-white/50">Permanently remove your account and all associated data. This action cannot be undone.</p>
              </div>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 active:scale-95 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};
