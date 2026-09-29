import {
  computeBandSignal,
  type BandSignalMode,
  type BandSignalPoint,
  type HistoryValuePoint
} from '../lib/bandSignal';

interface BandSignalWorkerRequest {
  id: number;
  history: HistoryValuePoint[];
  mode: BandSignalMode;
}

interface BandSignalWorkerResponse {
  id: number;
  latest: BandSignalPoint | null;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<BandSignalWorkerRequest>) => void) | null;
  postMessage: (message: BandSignalWorkerResponse) => void;
};

workerScope.onmessage = ({ data }: MessageEvent<BandSignalWorkerRequest>) => {
  const computed = computeBandSignal(data.history, data.mode);
  const latest = computed.length > 0 ? computed[computed.length - 1] : null;
  workerScope.postMessage({ id: data.id, latest });
};

export {};
