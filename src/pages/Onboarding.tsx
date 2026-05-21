import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeOnboarding } from "../lib/api/recommendation";
import { Logo } from "../components/common/Logo";
import InterestsStep from "../components/onboarding/InterestsStep";
import ChannelsStep from "../components/onboarding/ChannelsStep";
import ImportStep from "../components/onboarding/ImportStep";

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const handleTopicToggle = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics(selectedTopics.filter((t) => t !== topic));
    } else {
      setSelectedTopics([...selectedTopics, topic]);
    }
  };

  const canAdvance = currentStep === 0 ? selectedTopics.length >= 3 : true;

  const handleNext = async () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    } else {
      try {
        const topics = selectedTopics.length >= 3 ? selectedTopics : ["Science", "Technology", "Music"];
        await completeOnboarding(topics);
        navigate("/");
      } catch (e) {
        console.error("Failed to complete onboarding", e);
        navigate("/");
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    try {
      const topics = selectedTopics.length >= 3 ? selectedTopics : ["Science", "Technology", "Music"];
      await completeOnboarding(topics);
      navigate("/");
    } catch (e) {
      console.error("Failed to skip onboarding", e);
      navigate("/");
    }
  };

  const progressPercentage = ((currentStep + 1) / 3) * 100;

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-surface font-sans relative">
      {/* Absolute Top Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-zinc-800/50 z-50">
        <div 
          className="h-full bg-primary transition-all duration-500 ease-out" 
          style={{ width: `${progressPercentage}%` }} 
        />
      </div>

      {/* Header with Logo */}
      <div className="absolute top-0 left-0 p-8 z-40">
        <Logo size={40} showText={true} />
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto w-full pt-32 pb-16">
        <div className="max-w-5xl mx-auto px-8 lg:px-12 w-full">
          {currentStep === 0 && (
            <InterestsStep
              selectedTopics={selectedTopics}
              onTopicToggle={handleTopicToggle}
            />
          )}

          {currentStep === 1 && (
            <ChannelsStep selectedTopics={selectedTopics} />
          )}

          {currentStep === 2 && (
            <ImportStep />
          )}
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="w-full bg-surface border-t border-neutral-800/50 z-40">
        <div className="max-w-5xl mx-auto px-8 lg:px-12 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {currentStep > 0 && (
              <button
                className="text-neutral-500 hover:text-neutral-300 font-semibold text-sm transition-colors cursor-pointer flex items-center gap-2"
                onClick={handleBack}
              >
                <span>&larr;</span> Back
              </button>
            )}
            <button
              className="text-neutral-500 hover:text-neutral-300 font-semibold text-sm transition-colors cursor-pointer"
              onClick={handleSkip}
            >
              Skip Setup
            </button>
          </div>
          
          <button
            className={`px-8 py-3 rounded-full font-bold text-sm transition-all duration-300 ${
              canAdvance 
                ? "bg-primary text-white hover:bg-primary shadow-lg shadow-primary/20 active:scale-95 cursor-pointer" 
                : "bg-neutral-800 text-neutral-500 opacity-50 cursor-not-allowed"
            }`}
            disabled={!canAdvance}
            onClick={handleNext}
          >
            {currentStep === 2 ? "Finish Setup" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
