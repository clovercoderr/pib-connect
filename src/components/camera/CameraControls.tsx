import { useEffect } from "react";
import { useCameraStore } from "../../stores/cameraStore";

export default function CameraControls() {
  const { settings, fetchSettings, updateSettings } = useCameraStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!settings) {
    return (
      <div className="text-xs text-white/35">Camera settings are unavailable.</div>
    );
  }

  const hasLegacyControls =
    typeof settings.brightness === "number" ||
    typeof settings.contrast === "number" ||
    typeof settings.saturation === "number" ||
    typeof settings.sharpness === "number";

  if (hasLegacyControls) {
    const sliders = [
      { label: "Brightness", key: "brightness" as const, min: -100, max: 100 },
      { label: "Contrast", key: "contrast" as const, min: -100, max: 100 },
      { label: "Saturation", key: "saturation" as const, min: -100, max: 100 },
      { label: "Sharpness", key: "sharpness" as const, min: -100, max: 100 },
    ];

    return (
      <div className="flex flex-col gap-2">
        {sliders.map(({ label, key, min, max }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-white/50 w-20 shrink-0">{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              value={Number(settings[key] ?? 0)}
              onChange={(e) => updateSettings({ [key]: Number(e.target.value) })}
              className="flex-1 h-1 accent-blue-500"
            />
            <span className="text-xs text-white/50 w-8 text-right">
              {Number(settings[key] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50 w-24 shrink-0">Resolution</span>
        <select
          value={settings.resolution || "SD"}
          onChange={(e) => updateSettings({ resolution: e.target.value })}
          className="flex-1 px-2 py-1 text-xs rounded bg-white/6 border border-white/6 text-white/80 outline-none"
        >
          <option value="SD" className="bg-neutral-800">SD</option>
          <option value="HD" className="bg-neutral-800">HD</option>
          <option value="FHD" className="bg-neutral-800">FHD</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50 w-24 shrink-0">Refresh</span>
        <input
          type="range"
          min={0.02}
          max={1}
          step={0.01}
          value={Number(settings.refreshRate ?? 0.1)}
          onChange={(e) => updateSettings({ refreshRate: Number(e.target.value) })}
          className="flex-1 h-1 accent-blue-500"
        />
        <span className="text-xs text-white/50 w-10 text-right">
          {Number(settings.refreshRate ?? 0.1).toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50 w-24 shrink-0">Quality</span>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={Number(settings.qualityFactor ?? 80)}
          onChange={(e) => updateSettings({ qualityFactor: Number(e.target.value) })}
          className="flex-1 h-1 accent-blue-500"
        />
        <span className="text-xs text-white/50 w-10 text-right">
          {Number(settings.qualityFactor ?? 80)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 w-8 shrink-0">X</span>
          <input
            type="number"
            min={160}
            max={3840}
            step={1}
            value={Number(settings.resX ?? 640)}
            onChange={(e) => updateSettings({ resX: Number(e.target.value) })}
            className="w-full px-2 py-1 text-xs rounded bg-white/6 border border-white/6 text-white/80 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 w-8 shrink-0">Y</span>
          <input
            type="number"
            min={120}
            max={2160}
            step={1}
            value={Number(settings.resY ?? 480)}
            onChange={(e) => updateSettings({ resY: Number(e.target.value) })}
            className="w-full px-2 py-1 text-xs rounded bg-white/6 border border-white/6 text-white/80 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
