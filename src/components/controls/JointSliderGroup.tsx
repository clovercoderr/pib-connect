import { useState, ReactNode } from "react";
import { JOINT_CONFIGS } from "../../lib/jointConfig";
import { JointSlider } from "./JointSlider";

interface JointSliderGroupProps {
  group: string;
  label: string;
  prefix?: ReactNode;
  localOnly?: boolean;
}

export function JointSliderGroup({ group, label, prefix, localOnly = false }: JointSliderGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const joints = JOINT_CONFIGS.filter((j) => j.group === group);

  return (
    <div className="mb-3 rounded-[1.2rem] border border-white/[0.07] bg-[#161621]/88 p-2.5 shadow-[0_10px_22px_rgba(0,0,0,0.2)]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-2.5 flex w-full items-center justify-between rounded-xl px-1 py-0.5 text-left transition-colors hover:text-white/92"
      >
        <div>
          <div className="text-sm font-semibold text-white/92">{label}</div>
          <div className="text-[11px] text-white/42">{joints.length} joints</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <svg
            className={`h-3.5 w-3.5 text-white/70 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {prefix}
          {joints.map((joint) => (
            <JointSlider
              key={joint.id}
              jointId={joint.id}
              label={joint.label}
              localOnly={localOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}
