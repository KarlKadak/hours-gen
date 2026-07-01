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
    <div className="flex flex-col gap-2 w-fit">
      <div className="flex items-center gap-2">
        <label>
          <b>Upload CSV:</b>&nbsp;
          <input type="file" accept=".csv" onChange={onFileChange} />
        </label>
        <button
          type="button"
          onClick={onClockifyPull}
          disabled={clockifyLoading}
          className="px-2 py-1 text-white border border-white rounded text-sm cursor-pointer hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {clockifyLoading ? "Pulling…" : "Pull from Clockify"}
        </button>
      </div>
      {clockifyError && (
        <p className="text-red-400 text-sm max-w-xs">{clockifyError}</p>
      )}
      <label>
        <b>Duration coefficient:</b>
        <input
          type="number"
          step="0.01"
          min="0"
          value={coeff}
          onChange={(e) => setCoeff(parseFloat(e.target.value) || 1)}
          className="w-20 ml-2"
        />
      </label>
      <label>
        <b>Skip coefficient on starred rows:</b>
        <input
          type="checkbox"
          checked={skipCoeffOnStar}
          onChange={(e) => setSkipCoeffOnStar(e.target.checked)}
          className="ml-2"
        />
      </label>
      <label>
        <b>Rounding:</b>
        <select
          value={roundMode}
          onChange={(e) =>
            isRoundMode(e.target.value) && setRoundMode(e.target.value)
          }
          className="ml-2"
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
            className="ml-2"
          >
            {ROUND_INTERVALS.map((intv) => (
              <option key={intv} value={intv}>
                {intv} min
              </option>
            ))}
          </select>
        )}
      </label>
      <label>
        <b>Display as:</b>
        <select
          value={displayMode}
          onChange={(e) =>
            isDisplayMode(e.target.value) && setDisplayMode(e.target.value)
          }
          className="ml-2"
        >
          <option value="decimal">Decimal</option>
          <option value="hhmm">HH:MM</option>
        </select>
      </label>
    </div>
  );
};