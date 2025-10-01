import { RoundMode, RoundInt, DisplayMode } from "../types";

export const roundDuration = (mins: number, mode: RoundMode, interval: RoundInt) => {
  if (mode === "keep") return mins;
  if (mode === "down") return Math.floor(mins / interval) * interval;
  if (mode === "up") return Math.ceil(mins / interval) * interval;
  return Math.round(mins / interval) * interval;
};

export const formatDuration = (value: number, displayMode: DisplayMode) => {
  if (displayMode === "decimal") return value.toFixed(2);
  const totalMins = Math.round(value * 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
};