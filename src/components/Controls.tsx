import { FC, ChangeEvent } from "react";
import { RoundMode, RoundInt, DisplayMode } from "../types";
import { ROUND_INTERVALS } from "../utils/constants";
import { isRoundMode, isRoundInt, isDisplayMode } from "../utils/validators";

interface ControlsProps {
  coeff: number;
  setCoeff: (value: number) => void;
  roundMode: RoundMode;
  setRoundMode: (value: RoundMode) => void;
  roundInt: RoundInt;
  setRoundInt: (value: RoundInt) => void;
  displayMode: DisplayMode;
  setDisplayMode: (value: DisplayMode) => void;
  skipCoeffOnStar: boolean;
  setSkipCoeffOnStar: (value: boolean) => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClockifyPull: () => void;
  clockifyLoading: boolean;
  clockifyError?: string | null;
}

export const Controls: FC<ControlsProps> = ({
  coeff,
  setCoeff,
  roundMode,
  setRoundMode,
  roundInt,
  setRoundInt,
  displayMode,
  setDisplayMode,
  skipCoeffOnStar,
  setSkipCoeffOnStar,
  onFileChange,
  onClockifyPull,
  clockifyLoading,
  clockifyError,
}) => {
  return (
    <div className="card">
      <div className="card-title">Data source</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload CSV
          <input
            type="file"
            accept=".csv"
            onChange={onFileChange}
            className="sr-only"
          />
        </label>
        <button
          type="button"
          onClick={onClockifyPull}
          disabled={clockifyLoading}
          className="btn btn-primary"
        >
          {clockifyLoading ? (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          )}
          {clockifyLoading ? "Pulling…" : "Pull from Clockify"}
        </button>
      </div>
      {clockifyError && (
        <p className="mt-2 text-sm text-[var(--danger)]">{clockifyError}</p>
      )}

      <hr className="divider my-5" />

      <div className="card-title">Adjustments</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="coeff">
            Duration coefficient
          </label>
          <input
            id="coeff"
            type="number"
            step="0.01"
            min="0"
            value={coeff}
            onChange={(e) => setCoeff(parseFloat(e.target.value) || 1)}
            className="control w-full"
          />
        </div>

        <div>
          <label className="label" htmlFor="displayMode">
            Display as
          </label>
          <select
            id="displayMode"
            value={displayMode}
            onChange={(e) =>
              isDisplayMode(e.target.value) && setDisplayMode(e.target.value)
            }
            className="control w-full"
          >
            <option value="decimal">Decimal (1.50)</option>
            <option value="hhmm">HH:MM (1:30)</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="roundMode">
            Rounding
          </label>
          <div className="flex gap-2">
            <select
              id="roundMode"
              value={roundMode}
              onChange={(e) =>
                isRoundMode(e.target.value) && setRoundMode(e.target.value)
              }
              className="control flex-1"
            >
              <option value="keep">Do not round</option>
              <option value="standard">Round (standard)</option>
              <option value="down">Round down</option>
              <option value="up">Round up</option>
            </select>
            {roundMode !== "keep" && (
              <select
                value={roundInt}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (isRoundInt(value)) setRoundInt(value);
                }}
                className="control w-28"
              >
                {ROUND_INTERVALS.map((intv) => (
                  <option key={intv} value={intv}>
                    {intv} min
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={skipCoeffOnStar}
            onChange={(e) => setSkipCoeffOnStar(e.target.checked)}
          />
          Skip coefficient on starred (<code className="text-[var(--text-muted)]">*</code>) rows
        </label>
      </div>
    </div>
  );
};
