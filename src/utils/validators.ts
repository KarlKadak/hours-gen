import { RoundMode, RoundInt, DisplayMode, TargetHoursMode } from "../types";

export const isRoundMode = (value: unknown): value is RoundMode =>
  typeof value === "string" &&
  ["keep", "standard", "down", "up"].includes(value);

export const isRoundInt = (value: unknown): value is RoundInt =>
  typeof value === "number" && [5, 10, 15, 30, 60].includes(value);

export const isDisplayMode = (value: unknown): value is DisplayMode =>
  typeof value === "string" && ["decimal", "hhmm"].includes(value);

export const isTargetHoursMode = (value: unknown): value is TargetHoursMode =>
  typeof value === "string" && ["total", "workingDays"].includes(value);