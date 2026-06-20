
import React from 'react';
import { X, FileText, Mic, Wand2, Music, Video, Lightbulb, Volume2, Layers, Clock, Settings, Key } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm animate-fade-in sm:p-6">
      <div
        className="relative mx-auto my-2 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0F0F0F] shadow-2xl sm:my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-linear-to-r from-white/5 to-transparent p-3 sm:p-4">
          <div className="space-y-0.5">
             <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white sm:text-xl">
               <Lightbulb className="h-5 w-5 text-branding-primary" />
               How to Use
             </h2>
             <p className="text-xs font-medium text-white/40">Master the art of creating tutorials in minutes</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors min-w-9 min-h-9 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">

          {/* Step 1: Upload */}
          <section className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-sm font-bold text-white">1. Import Your Content</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Start by uploading a PDF document. Each page of your PDF will automatically become a slide in your video. The text from each page is extracted to serve as the initial script for the Text-to-Speech (TTS) engine.
              </p>
            </div>
          </section>

          {/* Step 2: Edit & Refine */}
          <section className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
              <Mic className="w-4 h-4 text-purple-400" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-sm font-bold text-white">2. Create Your Script & Audio</h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                   <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                     <Wand2 className="w-3.5 h-3.5 text-branding-primary" /> AI Enhancement
                   </h4>
                   <p className="text-xs text-white/50">
                     Raw PDF text can be messy. Use the <strong>"AI Fix Script"</strong> button to instantly transform fragmented text into natural, spoken sentences.
                   </p>
                </div>
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                   <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                     <Mic className="w-3.5 h-3.5 text-branding-primary" /> Script Polish
                   </h4>
                   <p className="text-xs text-white/50">
                     Edit your script directly in each slide card or Focus Mode, then generate TTS to voice the full script.
                   </p>
                </div>
              </div>
      <div className="grid gap-2 md:grid-cols-3">
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
               <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                 <Volume2 className="w-3.5 h-3.5 text-branding-primary" /> Voice
               </h4>
               <p className="text-xs text-white/50">
                 Assign unique voices to different slides for a dynamic narration experience.
               </p>
          </div>
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
               <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                 <Layers className="w-3.5 h-3.5 text-branding-primary" /> Transition
               </h4>
               <p className="text-xs text-white/50">
                 Choose visual transitions (Fade, Slide, Zoom, None) for how the slide appears.
               </p>
          </div>
           <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
               <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                 <Clock className="w-3.5 h-3.5 text-branding-primary" /> Delay
               </h4>
               <p className="text-xs text-white/50">
                 Set wait time (seconds) <em>after</em> audio ends before moving to the next slide.
               </p>
          </div>
      </div>
            </div>
          </section>

          {/* Step 3: Music & Atmosphere */}
          <section className="flex gap-3">
             <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0 border border-pink-500/20">
              <Music className="w-4 h-4 text-pink-400" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-sm font-bold text-white">3. Add Atmosphere</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Upload a background music track to set the mood. Adjust the volume slider to ensure it doesn't overpower the voiceover. Use the global settings to persist your favorite track across sessions.
              </p>
            </div>
          </section>

           {/* Step 4: Configure Settings */}
          <section className="flex gap-3">
             <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
              <Settings className="w-4 h-4 text-orange-400" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-sm font-bold text-white">4. Configure Global Settings</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Click the <strong>Settings</strong> button in the top right to access global configurations:
              </p>
               <div className="grid gap-2 md:grid-cols-3">
                  <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                      <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5 text-branding-primary" /> General
                      </h4>
                      <p className="text-xs text-white/50">
                        Set defaults for <strong>Transitions</strong>, <strong>Delay</strong>, and <strong>Music</strong> that apply to all new slides.
                      </p>
                  </div>
                   <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                      <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-branding-primary" /> API Keys
                      </h4>
                      <p className="text-xs text-white/50">
                        Enter your <strong>Gemini API Key</strong> to unlock the "AI Fix Script" feature.
                      </p>
                  </div>
                  <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                      <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-branding-primary" /> TTS Model
                      </h4>
                      <p className="text-xs text-white/50">
                        Choose between <strong>High Quality (q8)</strong> or <strong>Fastest (q4)</strong> speech generation models.
                      </p>
                  </div>
               </div>
            </div>
          </section>

           {/* Step 5: Preview & Export */}
           <section className="flex gap-3">
             <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Video className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-sm font-bold text-white">5. Preview & Export</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Switch to the <strong>Preview Tab</strong> to watch your full video composition. When you're happy with the result, choose between:
              </p>
              <ul className="space-y-1 text-xs text-white/60 list-disc pl-4">
                <li><strong>Render Video (With TTS)</strong>: The complete package with all voiceovers and music.</li>
                <li><strong>Render Silent Video</strong>: Perfect if you want to record your own voiceover later or just need the visuals.</li>
              </ul>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end border-t border-white/10 bg-black/20 p-3 sm:p-4">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform"
          >
            Got it, let's create!
          </button>
        </div>
      </div>
    </div>
  );
};
