import React, { useState, useRef } from 'react';
import { X, Upload, Music, Trash2, Settings, Mic, Clock, ChevronRight, Key, Sparkles } from 'lucide-react';
import { AVAILABLE_VOICES } from '../services/ttsService';
import { Dropdown } from './Dropdown';
import type { GlobalSettings } from '../services/storage';

import { reloadTTS } from '../services/ttsService';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: GlobalSettings | null;
  onSave: (settings: GlobalSettings) => Promise<void>;
}

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave
}) => {
  const [isEnabled, setIsEnabled] = useState(currentSettings?.isEnabled ?? false);
  const [voice, setVoice] = useState(currentSettings?.voice ?? AVAILABLE_VOICES[0].id);
  const [delay, setDelay] = useState(currentSettings?.delay ?? 0.5);
  const [transition, setTransition] = useState<GlobalSettings['transition']>(currentSettings?.transition ?? 'fade');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(currentSettings?.music?.volume ?? 0.5);
  const [savedMusicName, setSavedMusicName] = useState<string | null>(currentSettings?.music?.fileName ?? null);
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'tts'>('general');
  const [ttsQuantization, setTtsQuantization] = useState<GlobalSettings['ttsQuantization']>(currentSettings?.ttsQuantization ?? 'q4');
  const [useLocalTTS, setUseLocalTTS] = useState(currentSettings?.useLocalTTS ?? false);
  const [localTTSUrl, setLocalTTSUrl] = useState(currentSettings?.localTTSUrl ?? 'http://localhost:8880/v1/audio/speech');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key') || '');
      setBaseUrl(localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/');
      setModel(localStorage.getItem('llm_model') || 'gemini-2.5-flash');
    }
  }, [isOpen]);

  const [existingMusicBlob, setExistingMusicBlob] = useState<Blob | null>(currentSettings?.music?.blob ?? null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
      setSavedMusicName(file.name);
      setExistingMusicBlob(null); // Clear existing blob as we have a new file
    }
  };

  const handleSave = async () => {
    const musicBlob = musicFile ? musicFile : existingMusicBlob;
    
    // If enabled, validations could be added here if needed

    const settings: GlobalSettings = {
      isEnabled,
      voice,
      delay,
      transition,
      music: musicBlob && savedMusicName ? {
        blob: musicBlob,
        volume: musicVolume,
        fileName: savedMusicName
      } : undefined,
      ttsQuantization,
      useLocalTTS,
      localTTSUrl
    };
    
    // Check if quantization changed to reload model
    if (currentSettings?.ttsQuantization !== ttsQuantization) {
         if (ttsQuantization) reloadTTS(ttsQuantization);
    }

    localStorage.setItem('llm_api_key', apiKey);
    localStorage.setItem('llm_base_url', baseUrl);
    localStorage.setItem('llm_model', model);
    await onSave(settings);
    onClose();
  };

  const removeMusic = () => {
    setMusicFile(null);
    setExistingMusicBlob(null);
    setSavedMusicName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-branding-primary/20 text-branding-primary">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Settings</h2>
              <p className="text-xs text-white/40 font-medium">Apply configured settings to all future videos</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>



        {/* Tabs */}
        <div className="flex items-center gap-1 p-2 bg-white/5 border-b border-white/5">
           <button
             onClick={() => setActiveTab('general')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
           >
             <Settings className="w-4 h-4" /> General
           </button>
           <button
             onClick={() => setActiveTab('api')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'api' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
           >
             <Key className="w-4 h-4" /> API Keys
           </button>
           <button
             onClick={() => setActiveTab('tts')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'tts' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
           >
             <Mic className="w-4 h-4" /> TTS Model
           </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto space-y-8 flex-1">
          
          {activeTab === 'general' ? (
            <>
          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-branding-primary/5 border border-branding-primary/20">
            <div className="space-y-1">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                Enable Global Defaults
                {isEnabled && <span className="text-[10px] bg-branding-primary text-black px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide">Active</span>}
              </div>
              <p className="text-xs text-white/50">Overrides individual slide settings upon creation</p>
            </div>
            <button
               onClick={() => setIsEnabled(!isEnabled)}
               className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${isEnabled ? 'bg-branding-primary' : 'bg-white/10'}`}
            >
               <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${isEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className={`space-y-8 transition-opacity duration-300 ${isEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">


               {/* Delay */}
               <div className="space-y-4">
                <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                  <Clock className="w-4 h-4" /> Post-Audio Delay
                </label>
                <div className="relative">
                   <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={delay}
                    onChange={(e) => setDelay(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">SEC</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Transition */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                  <ChevronRight className="w-4 h-4" /> Default Transition
                </label>
                 <Dropdown
                  options={[
                    { id: 'fade', name: 'Fade' },
                    { id: 'slide', name: 'Slide' },
                    { id: 'zoom', name: 'Zoom' },
                    { id: 'none', name: 'None' },
                  ]}
                  value={transition}
                  onChange={(val) => setTransition(val as GlobalSettings['transition'])}
                  className="bg-black/20"
                />
              </div>

               {/* Music */}
               <div className="space-y-4">
                <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                  <Music className="w-4 h-4" /> Default Music
                </label>
                <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-4">
                  {savedMusicName ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                        <span className="text-sm text-white truncate max-w-[150px]">{savedMusicName}</span>
                        <button onClick={removeMusic} className="text-white/40 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-white/40 uppercase font-bold">
                            <span>Volume</span>
                            <span>{Math.round(musicVolume * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={musicVolume}
                            onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary"
                          />
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3 border border-dashed border-white/20 rounded-lg text-white/40 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Upload className="w-4 h-4" /> Upload Track
                    </button>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="audio/*"
                    onChange={handleMusicUpload}
                  />
                </div>
              </div>
            </div>

          </div>
          </>
          ) : activeTab === 'tts' ? (
              <div className="space-y-8">
                <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-4">
                        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-500 h-fit">
                            <Mic className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-bold text-white">Kokoro TTS Configuration</h3>
                            <p className="text-xs text-white/60 leading-relaxed">
                                Configure the local Text-to-Speech model. "q8" offers higher quality but is larger (~80MB), 
                                while "q4" is faster and smaller (~45MB) with slightly reduced quality.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                            <Mic className="w-4 h-4" /> Default Voice
                        </label>
                        <Dropdown
                            options={AVAILABLE_VOICES}
                            value={voice}
                            onChange={setVoice}
                            className="bg-black/20"
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        Use Local TTS Instance
                                        {useLocalTTS && <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide">Active</span>}
                                    </h3>
                                    <p className="text-xs text-white/60">
                                        Connect to a local Dockerized Kokoro FastAPI instance instead of using the browser model.
                                    </p>
                                </div>
                                <button
                                   onClick={() => setUseLocalTTS(!useLocalTTS)}
                                   className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${useLocalTTS ? 'bg-purple-500' : 'bg-white/10'}`}
                                >
                                   <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useLocalTTS ? 'translate-x-7' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {useLocalTTS && (
                                <div className="space-y-3 animate-fade-in border-t border-white/5 pt-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest">
                                            API Endpoint URL
                                        </label>
                                        <input
                                            type="text"
                                            value={localTTSUrl}
                                            onChange={(e) => setLocalTTSUrl(e.target.value)}
                                            placeholder="http://localhost:8880/v1/audio/speech"
                                            className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white outline-none transition-all font-mono text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                        />
                                    </div>
                                    <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                        <p className="text-[10px] text-yellow-200">
                                            <strong>Note:</strong> When enabled, browser-side quantization settings are ignored. 
                                            Request format follows OpenAI audio/speech standard.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {!useLocalTTS && (
                    <div className="space-y-4">
                        <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                            Model Quantization
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setTtsQuantization('q8')}
                                className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${ttsQuantization === 'q8' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                            >
                                <span className="text-lg font-bold">q8 (High Quality)</span>
                                <span className={`text-xs ${ttsQuantization === 'q8' ? 'text-black/60' : 'text-white/40'}`}>
                                    Recommended for best audio output.
                                </span>
                            </button>
                            <button
                                onClick={() => setTtsQuantization('q4')}
                                className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${ttsQuantization === 'q4' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                            >
                                <span className="text-lg font-bold">q4 (Fastest)</span>
                                <span className={`text-xs ${ttsQuantization === 'q4' ? 'text-black/60' : 'text-white/40'}`}>
                                    Faster inference, smaller download.
                                </span>
                            </button>
                        </div>
                    </div>
                    )}
                </div>
              </div>
          ) : (
            <div className="space-y-6">
               <div className="p-4 rounded-xl bg-branding-accent/10 border border-branding-accent/20 flex gap-4">
                 <div className="p-2 rounded-lg bg-branding-accent/20 text-branding-accent h-fit">
                    <Sparkles className="w-5 h-5" />
                 </div>
                 <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">LLM Configuration</h3>
                    <p className="text-xs text-white/60 leading-relaxed">
                       Configure an OpenAI-compatible endpoint (e.g., Gemini, OpenAI, LocalAI) for script enhancement.
                    </p>
                 </div>
               </div>

               {/* Base URL */}
               <div className="space-y-4">
                 <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                   Base URL
                 </label>
                 <div className="relative">
                    <input
                     type="text"
                     value={baseUrl}
                     onChange={(e) => setBaseUrl(e.target.value)}
                     placeholder="https://api.openai.com/v1"
                     className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white outline-none transition-all font-mono text-sm"
                   />
                 </div>
               </div>

               {/* Model Name */}
               <div className="space-y-4">
                 <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                   Model Name
                 </label>
                 <div className="relative">
                    <input
                     type="text"
                     value={model}
                     onChange={(e) => setModel(e.target.value)}
                     placeholder="gpt-4o, gemini-1.5-pro, etc."
                     className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white outline-none transition-all font-mono text-sm"
                   />
                 </div>
               </div>

               {/* API Key */}
               <div className="space-y-4">
                 <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                   <Key className="w-4 h-4" /> API Key
                 </label>
                 <div className="relative">
                    <input
                     type="password"
                     value={apiKey}
                     onChange={(e) => setApiKey(e.target.value)}
                     placeholder="sk-..."
                     className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white outline-none transition-all font-mono text-sm"
                   />
                 </div>
                 <p className="text-[10px] text-white/30">
                    Your key is stored locally in your browser and is never sent to our servers.
                 </p>
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-3 transition-colors">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-2.5 rounded-xl bg-white text-black font-extrabold hover:bg-white/90 hover:scale-105 active:scale-95 transition-all text-sm shadow-lg shadow-white/20"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
