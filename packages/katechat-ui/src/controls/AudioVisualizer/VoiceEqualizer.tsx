import React, { useState } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { AudioVisualizer } from "./AudioVisualizer";

import "./VoiceEqualizer.scss";

export const VOICE_EQUALIZER_COLLAPSED_HEIGHT = 96;
export const VOICE_EQUALIZER_EXPANDED_HEIGHT = VOICE_EQUALIZER_COLLAPSED_HEIGHT * 4;

interface VoiceEqualizerProps {
  /** Panel is rendered only while active (a voice session or recording is running) */
  active: boolean;
  inputAnalyser?: AnalyserNode | null;
  outputAnalyser?: AnalyserNode | null;
  expandedHeight?: number;
  defaultCollapsed?: boolean;
}

/**
 * Voice session equalizer panel: expanded it shows a full-size visualizer,
 * collapsed it shrinks to a slim strip with a live mini equalizer.
 */
export const VoiceEqualizer: React.FC<VoiceEqualizerProps> = ({
  active,
  inputAnalyser,
  outputAnalyser,
  expandedHeight = VOICE_EQUALIZER_EXPANDED_HEIGHT,
  defaultCollapsed = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { t } = useTranslation();

  if (!active) return null;

  const height = collapsed ? VOICE_EQUALIZER_COLLAPSED_HEIGHT : expandedHeight;

  return (
    <div
      className={["katechat-voice-equalizer", collapsed ? "collapsed" : ""].join(" ")}
      style={{ height }}
      data-testid="voice-equalizer"
    >
      <div className="katechat-voice-equalizer-canvas">
        <AudioVisualizer inputAnalyser={inputAnalyser} outputAnalyser={outputAnalyser} height={height} />
      </div>

      <button
        type="button"
        className="katechat-voice-equalizer-toggle"
        aria-label={collapsed ? t("Expand equalizer") : t("Collapse equalizer")}
        onClick={() => setCollapsed(v => !v)}
      >
        {collapsed ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
      </button>
    </div>
  );
};

VoiceEqualizer.displayName = "VoiceEqualizer";
