
import React from 'react';
import { X, FileText, Mic, Wand2, Music, Video, Lightbulb, Volume2, Layers, Clock, Settings, Key } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-4xl max-h-[85vh] bg-[#0F0F0F] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-8 border-b border-white/5 flex items-center justify-between bg-linear-to-r from-white/5 to-transparent gap-4">
          <div className="space-y-1">
             <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2 sm:gap-3">
               <Lightbulb className="w-6 h-6 sm:w-8 sm:h-8 text-branding-primary" />
               How to Use
             </h2>
             <p className="text-sm sm:text-base text-white/40 font-medium">Master the art of creating tutorials in minutes</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors min-w-11 min-h-11 flex items-center justify-center"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] sm:max-h-[70vh] p-4 sm:p-8 space-y-8 sm:space-y-12 scroller">
          
          {/* Step 1: Upload */}
          <section className="flex gap-4 sm:gap-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            </div>
            <div className="space-y-4 flex-1">
              <h3 className="text-xl font-bold text-white">1. Import Your Content</h3>
              <p className="text-white/60 leading-relaxed">
                Start by uploading a PDF document. Each page of your PDF will automatically become a slide in your video. The text from each page is extracted to serve as the initial script for the Text-to-Speech (TTS) engine.
              </p>
            </div>
          </section>

          {/* Step 2: Edit & Refine */}
          <section className="flex gap-6">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
              <Mic className="w-6 h-6 text-purple-400" />
            </div>
            <div className="space-y-4 flex-1">
              <h3 className="text-xl font-bold text-white">2. Create Your Script & Audio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                     <Wand2 className="w-4 h-4 text-branding-primary" /> AI Enhancement
                   </h4>
                   <p className="text-sm text-white/50">
                     Raw PDF text can be messy. Use the <strong>"AI Fix Script"</strong> button to instantly transform fragmented text into natural, spoken sentences.
                   </p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                     <span className="w-4 h-4 rounded bg-teal-500/50 flex items-center justify-center text-[10px] font-bold">H</span> Highlights
                   </h4>
                   <p className="text-sm text-white/50">
                     Only want to read specific parts? <strong>Highlight text</strong> in the script box. You can select multiple distinct sections, and the TTS engine will combine them, skipping unselected text.
                   </p>
                </div>
              </div>
      <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
               <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                 <Volume2 className="w-4 h-4 text-branding-primary" /> Voice
               </h4>
               <p className="text-sm text-white/50">
                 Assign unique voices to different slides for a dynamic narration experience.
               </p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
               <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                 <Layers className="w-4 h-4 text-branding-primary" /> Transition
               </h4>
               <p className="text-sm text-white/50">
                 Choose visual transitions (Fade, Slide, Zoom, None) for how the slide appears.
               </p>
          </div>
           <div className="bg-white/5 p-4 rounded-xl border border-white/5">
               <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                 <Clock className="w-4 h-4 text-branding-primary" /> Delay
               </h4>
               <p className="text-sm text-white/50">
                 Set wait time (seconds) <em>after</em> audio ends before moving to the next slide.
               </p>
          </div>
      </div>
            </div>
          </section>

          {/* Step 3: Music & Atmosphere */}
          <section className="flex gap-6">
             <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center shrink-0 border border-pink-500/20">
              <Music className="w-6 h-6 text-pink-400" />
            </div>
            <div className="space-y-4 flex-1">
              <h3 className="text-xl font-bold text-white">3. Add Atmosphere</h3>
              <p className="text-white/60 leading-relaxed">
                Upload a background music track to set the mood. Adjust the volume slider to ensure it doesn't overpower the voiceover. Use the global settings to persist your favorite track across sessions.
              </p>
            </div>
          </section>

           {/* Step 4: Configure Settings */}
          <section className="flex gap-6">
             <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
              <Settings className="w-6 h-6 text-orange-400" />
            </div>
            <div className="space-y-4 flex-1">
              <h3 className="text-xl font-bold text-white">4. Configure Global Settings</h3>
              <p className="text-white/60 leading-relaxed">
                Click the <strong>Settings</strong> button in the top right to access global configurations:
              </p>
               <div className="grid md:grid-cols-3 gap-6">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <Settings className="w-4 h-4 text-branding-primary" /> General
                      </h4>
                      <p className="text-sm text-white/50">
                        Set defaults for <strong>Transitions</strong>, <strong>Delay</strong>, and <strong>Music</strong> that apply to all new slides.
                      </p>
                  </div>
                   <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <Key className="w-4 h-4 text-branding-primary" /> API Keys
                      </h4>
                      <p className="text-sm text-white/50">
                        Enter your <strong>Gemini API Key</strong> to unlock the "AI Fix Script" feature.
                      </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <Mic className="w-4 h-4 text-branding-primary" /> TTS Model
                      </h4>
                      <p className="text-sm text-white/50">
                        Choose between <strong>High Quality (q8)</strong> or <strong>Fastest (q4)</strong> speech generation models.
                      </p>
                  </div>
               </div>
            </div>
          </section>

           {/* Step 5: Preview & Export */}
           <section className="flex gap-6">
             <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Video className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="space-y-4 flex-1">
              <h3 className="text-xl font-bold text-white">5. Preview & Export</h3>
              <p className="text-white/60 leading-relaxed">
                Switch to the <strong>Preview Tab</strong> to watch your full video composition. When you're happy with the result, choose between:
              </p>
              <ul className="space-y-2 text-sm text-white/60 list-disc pl-5">
                <li><strong>Render Video (With TTS)</strong>: The complete package with all voiceovers and music.</li>
                <li><strong>Render Silent Video</strong>: Perfect if you want to record your own voiceover later or just need the visuals.</li>
              </ul>
            </div>
          </section>

        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform"
          >
            Got it, let's create!
          </button>
        </div>
      </div>
    </div>
  );
};
