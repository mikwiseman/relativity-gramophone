import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react";

export function Transport({ isPlaying, isListener, onToggle, onRestart }) {
  return (
    <div className="transport" aria-label="Playback controls">
      <button
        type="button"
        className="icon-button transport-button"
        aria-label={isPlaying ? "Pause composition" : "Play composition"}
        onClick={onToggle}
      >
        {isPlaying ? <Pause aria-hidden="true" weight="fill" /> : <Play aria-hidden="true" weight="fill" />}
      </button>
      {isListener && (
        <button type="button" className="icon-button transport-button" aria-label="Play again" onClick={onRestart}>
          <ArrowCounterClockwise aria-hidden="true" weight="thin" />
        </button>
      )}
    </div>
  );
}
