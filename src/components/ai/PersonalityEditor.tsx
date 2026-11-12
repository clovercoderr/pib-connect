import { useState } from "react";
import { useAIStore } from "../../stores/aiStore";

/**
 * Full personality editor — rendered in the main area (where the chat
 * normally is) when `editingPersonalityId` is set in the store. Edits the
 * fields that actually persist to the pib-backend: name, system prompt,
 * gender, AI model, pause threshold, message history.
 */
export default function PersonalityEditor() {
  const {
    personalities,
    models,
    editingPersonalityId,
    updatePersonality,
    setEditingPersonality,
  } = useAIStore();

  const personality = personalities.find((p) => p.id === editingPersonalityId);

  // Local form state — initialized once from the personality being edited.
  const [name, setName] = useState(personality?.name ?? "");
  const [description, setDescription] = useState(personality?.description ?? "");
  const [gender, setGender] = useState(personality?.gender ?? "Unknown");
  const [modelId, setModelId] = useState(personality?.assistantModelId ?? 0);
  const [pauseThreshold, setPauseThreshold] = useState(
    personality?.pauseThreshold ?? 0.8,
  );
  const [messageHistory, setMessageHistory] = useState(
    personality?.messageHistory ?? 10,
  );
  const [saving, setSaving] = useState(false);

  if (!personality) {
    // editingPersonalityId points at something that no longer exists.
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Personality not found.
        <button
          onClick={() => setEditingPersonality(null)}
          className="ml-2 text-blue-400 hover:text-blue-300"
        >
          Back to chat
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    await updatePersonality(personality.id, {
      name,
      description,
      gender,
      assistantModelId: modelId,
      pauseThreshold,
      messageHistory,
    });
    setSaving(false);
    setEditingPersonality(null);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/90">
            Edit Personality
          </h2>
          <button
            onClick={() => setEditingPersonality(null)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Back to chat
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Personality name…"
            className="w-full px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/90 placeholder-white/30 outline-none focus:border-white/25 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">
            System Prompt
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="You are pib, a friendly humanoid robot…"
            rows={5}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/90 placeholder-white/30 outline-none focus:border-white/25 transition-colors resize-none leading-relaxed"
          />
          <p className="mt-1 text-[10px] text-white/30">
            This is what the AI is told about who it is. Tone, role, rules — all
            go here.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">
              AI Model
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/90 outline-none focus:border-white/25 transition-colors"
            >
              {models.length === 0 && (
                <option value={0} className="bg-neutral-800">
                  (no models loaded)
                </option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id} className="bg-neutral-800">
                  {m.visualName || m.apiName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">
              Gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/90 outline-none focus:border-white/25 transition-colors"
            >
              <option value="Female" className="bg-neutral-800">Female</option>
              <option value="Male" className="bg-neutral-800">Male</option>
              <option value="Unknown" className="bg-neutral-800">Unknown</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">
              Pause Threshold (s)
            </label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={pauseThreshold}
              onChange={(e) => setPauseThreshold(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/90 outline-none focus:border-white/25 transition-colors"
            />
            <p className="mt-1 text-[10px] text-white/30">
              Silence before the robot considers you done speaking.
            </p>
          </div>
          <div>
            <label className="block text-[11px] text-white/45 mb-1 uppercase tracking-wider">
              Message History
            </label>
            <input
              type="number"
              step={1}
              min={0}
              value={messageHistory}
              onChange={(e) => setMessageHistory(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/90 outline-none focus:border-white/25 transition-colors"
            />
            <p className="mt-1 text-[10px] text-white/30">
              How many past messages the AI sees for context.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setEditingPersonality(null)}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-white/60 border border-white/[0.08] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-500/25 hover:bg-blue-500/35 text-blue-200 border border-blue-500/40 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save personality"}
          </button>
        </div>
      </div>
    </div>
  );
}
