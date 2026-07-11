import { useMemo, useState, type KeyboardEvent } from "react";
import { Ban, Check, Heart, Loader2, Plus, RotateCw, X } from "lucide-react";

import { TOPIC_CATEGORIES } from "../../onboarding/constants";
import { TextInput } from "../../ui/TextInput";
import { getString } from "../../../lib/i18n/index";
import { useTastePreferences } from "../../../lib/useTastePreferences";

type TasteView = "interests" | "blocked";

const BLOCKED_SUGGESTIONS = [
  "asmr",
  "unboxing",
  "reaction",
  "vlogs",
  "news",
  "politics",
  "clickbait",
  "drama",
  "gossip",
  "challenge",
  "family vlog",
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function submitOnEnter(event: KeyboardEvent<HTMLInputElement>, submit: () => void) {
  if (event.key === "Enter") {
    event.preventDefault();
    submit();
  }
}

interface TopicChipProps {
  topic: string;
  active?: boolean;
  blocked?: boolean;
  saving?: boolean;
  onClick: () => void;
}

function TopicChip({ topic, active, blocked, saving, onClick }: TopicChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cx(
        "inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ease-out disabled:cursor-wait disabled:opacity-60",
        active
          ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
          : blocked
            ? "border border-chrome-red-900/50 bg-chrome-red-950/30 text-chrome-red-400 hover:bg-chrome-red-950/50"
            : "border border-chrome-neutral-700 bg-transparent text-chrome-neutral-300 hover:bg-chrome-neutral-800 hover:text-chrome-neutral-100",
      )}
    >
      {saving ? (
        <Loader2 size={15} className="animate-spin" />
      ) : active ? (
        <Check size={15} />
      ) : blocked ? (
        <Ban size={15} />
      ) : null}
      <span>{topic}</span>
    </button>
  );
}

interface RemovableChipProps {
  topic: string;
  tone: "interest" | "blocked";
  saving?: boolean;
  onRemove: () => void;
}

function RemovableChip({ topic, tone, saving, onRemove }: RemovableChipProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
        tone === "interest"
          ? "border-chrome-neutral-700 bg-surface-container-high text-chrome-neutral-200"
          : "border-chrome-red-900/50 bg-chrome-red-950/30 text-chrome-red-400",
      )}
    >
      {tone === "interest" ? <Heart size={14} /> : <Ban size={14} />}
      <span>{topic}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={saving}
        className="grid h-6 w-6 place-items-center rounded-full text-current transition-colors duration-200 ease-out hover:bg-chrome-neutral-800 disabled:cursor-wait disabled:opacity-60"
        title={getString(tone === "interest" ? "taste_remove_interest" : "taste_unblock_topic")}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <X size={14} />}
      </button>
    </span>
  );
}

interface AddTopicFormProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  buttonLabel: string;
  onSubmit: () => void;
  disabled?: boolean;
}

function AddTopicForm({
  value,
  onChange,
  placeholder,
  buttonLabel,
  onSubmit,
  disabled,
}: AddTopicFormProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <TextInput
        value={value}
        onChange={onChange}
        onKeyDown={(event) => submitOnEnter(event, onSubmit)}
        placeholder={placeholder}
        className="h-10 min-w-0 flex-1 rounded-lg"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-on-primary)] transition-colors duration-200 ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={16} />
        {buttonLabel}
      </button>
    </div>
  );
}

export function TasteTab() {
  const [view, setView] = useState<TasteView>("interests");
  const [interestInput, setInterestInput] = useState("");
  const [blockedInput, setBlockedInput] = useState("");
  const {
    addInterest,
    blockedSet,
    blockedTopics,
    blockTopic,
    error,
    loading,
    preferredSet,
    preferredTopics,
    refresh,
    removeInterest,
    savingTopic,
    toggleInterest,
    unblockBlockedTopic,
  } = useTastePreferences();

  const availableBlockedSuggestions = useMemo(
    () => BLOCKED_SUGGESTIONS.filter((topic) => !blockedSet.has(topic.toLowerCase())),
    [blockedSet],
  );

  const submitInterest = () => {
    const topic = interestInput.trim();
    if (!topic) return;
    void addInterest(topic);
    setInterestInput("");
  };

  const submitBlocked = () => {
    const topic = blockedInput.trim();
    if (!topic) return;
    void blockTopic(topic);
    setBlockedInput("");
  };

  return (
    <div className="grid grid-cols-12 gap-6 pb-8">
      <header className="col-span-12 flex flex-col gap-4 border-b border-chrome-neutral-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-chrome-neutral-100">
            {getString("taste_title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-chrome-neutral-400">
            {getString("taste_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-chrome-neutral-800 bg-surface-container-low p-1">
            {(["interests", "blocked"] as TasteView[]).map((item) => {
              const active = view === item;
              const Icon = item === "interests" ? Heart : Ban;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ease-out",
                    active
                      ? "bg-surface-container-high text-[var(--color-primary)]"
                      : "text-chrome-neutral-400 hover:bg-chrome-neutral-800 hover:text-chrome-neutral-100",
                  )}
                >
                  <Icon size={16} />
                  {getString(item === "interests" ? "taste_interests_tab" : "taste_blocked_tab")}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-full border border-chrome-neutral-800 bg-surface-container-low text-chrome-neutral-400 transition-colors duration-200 ease-out hover:bg-chrome-neutral-800 hover:text-chrome-neutral-100 disabled:cursor-wait disabled:opacity-60"
            title={getString("taste_refresh")}
          >
            <RotateCw size={16} className={loading ? "animate-spin" : undefined} />
          </button>
        </div>
      </header>

      {error && (
        <div className="col-span-12 rounded-2xl border border-chrome-red-900/50 bg-chrome-red-950/30 px-4 py-3 text-sm text-chrome-red-300">
          {getString(error === "load" ? "taste_load_failed" : "taste_save_failed")}
        </div>
      )}

      {view === "interests" ? (
        <>
          <section className="col-span-12 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5 xl:col-span-5">
            <div className="mb-4">
              <h2 className="text-base font-medium text-chrome-neutral-200">
                {getString("taste_add_interest")}
              </h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">
                {getString("taste_add_interest_desc")}
              </p>
            </div>
            <AddTopicForm
              value={interestInput}
              onChange={setInterestInput}
              onSubmit={submitInterest}
              placeholder={getString("taste_interest_placeholder")}
              buttonLabel={getString("taste_add")}
              disabled={Boolean(savingTopic)}
            />
          </section>

          <section className="col-span-12 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5 xl:col-span-7">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-medium text-chrome-neutral-200">
                  {getString("taste_current_interests")}
                </h2>
                <p className="mt-1 text-sm text-chrome-neutral-400">
                  {getString("taste_topics_count", preferredTopics.length)}
                </p>
              </div>
            </div>
            <div className="flex min-h-12 flex-wrap gap-2">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-sm text-chrome-neutral-400">
                  <Loader2 size={16} className="animate-spin" />
                  {getString("taste_loading")}
                </span>
              ) : preferredTopics.length > 0 ? (
                preferredTopics.map((topic) => (
                  <RemovableChip
                    key={topic}
                    topic={topic}
                    tone="interest"
                    saving={savingTopic?.toLowerCase() === topic.toLowerCase()}
                    onRemove={() => void removeInterest(topic)}
                  />
                ))
              ) : (
                <span className="text-sm text-chrome-neutral-500">{getString("taste_empty_interests")}</span>
              )}
            </div>
          </section>

          <section className="col-span-12 space-y-10">
            <div>
              <h2 className="text-base font-medium text-chrome-neutral-200">
                {getString("taste_browse_interests")}
              </h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">
                {getString("taste_browse_interests_desc")}
              </p>
            </div>

            {TOPIC_CATEGORIES.map((category) => (
              <section key={category.name}>
                <h3 className="mb-4 px-1 text-xs font-semibold uppercase tracking-widest text-chrome-neutral-500">
                  {category.name}
                </h3>
                <div className="flex flex-wrap gap-3">
                  {category.topics.map((topic) => {
                    const active = preferredSet.has(topic.toLowerCase());
                    const blocked = blockedSet.has(topic.toLowerCase());
                    return (
                      <TopicChip
                        key={topic}
                        topic={topic}
                        active={active}
                        blocked={blocked}
                        saving={savingTopic?.toLowerCase() === topic.toLowerCase()}
                        onClick={() => void toggleInterest(topic)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="col-span-12 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5 xl:col-span-5">
            <div className="mb-4">
              <h2 className="text-base font-medium text-chrome-neutral-200">
                {getString("taste_block_topic")}
              </h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">
                {getString("taste_block_topic_desc")}
              </p>
            </div>
            <AddTopicForm
              value={blockedInput}
              onChange={setBlockedInput}
              onSubmit={submitBlocked}
              placeholder={getString("taste_block_placeholder")}
              buttonLabel={getString("taste_block")}
              disabled={Boolean(savingTopic)}
            />
          </section>

          <section className="col-span-12 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5 xl:col-span-7">
            <div className="mb-4">
              <h2 className="text-base font-medium text-chrome-neutral-200">
                {getString("taste_current_blocked")}
              </h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">
                {getString("taste_blocked_count", blockedTopics.length)}
              </p>
            </div>
            <div className="flex min-h-12 flex-wrap gap-2">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-sm text-chrome-neutral-400">
                  <Loader2 size={16} className="animate-spin" />
                  {getString("taste_loading")}
                </span>
              ) : blockedTopics.length > 0 ? (
                blockedTopics.map((topic) => (
                  <RemovableChip
                    key={topic}
                    topic={topic}
                    tone="blocked"
                    saving={savingTopic?.toLowerCase() === topic.toLowerCase()}
                    onRemove={() => void unblockBlockedTopic(topic)}
                  />
                ))
              ) : (
                <span className="text-sm text-chrome-neutral-500">{getString("taste_empty_blocked")}</span>
              )}
            </div>
          </section>

          <section className="col-span-12 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5">
            <div className="mb-4">
              <h2 className="text-base font-medium text-chrome-neutral-200">
                {getString("taste_quick_block")}
              </h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">
                {getString("taste_quick_block_desc")}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {availableBlockedSuggestions.length > 0 ? (
                availableBlockedSuggestions.map((topic) => (
                  <TopicChip
                    key={topic}
                    topic={topic}
                    blocked={false}
                    saving={savingTopic?.toLowerCase() === topic.toLowerCase()}
                    onClick={() => void blockTopic(topic)}
                  />
                ))
              ) : (
                <span className="text-sm text-chrome-neutral-500">{getString("taste_no_block_suggestions")}</span>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
