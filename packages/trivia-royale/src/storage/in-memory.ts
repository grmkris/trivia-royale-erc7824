import type { Hex } from "viem";
import type { State } from "@erc7824/nitrolite";

export type StateStorage = {
  getChannelState: (channelId: Hex) => Promise<State[]>;
  appendChannelState: (channelId: Hex, state: State) => Promise<void>;
};

export const createInMemoryStateStorage = (): StateStorage => {
  const channelStates: Map<Hex, State[]> = new Map();
  return {
    getChannelState: async (channelId: Hex) => {
      const states = channelStates.get(channelId);
      // Return empty array if no states yet instead of throwing
      return states || [];
    },
    appendChannelState: async (channelId: Hex, state: State) => {
      const states = channelStates.get(channelId);
      if (!states) {
        channelStates.set(channelId, [state]);
        return;
      }
      states.push(state);
      channelStates.set(channelId, states);
    }
  };
};
