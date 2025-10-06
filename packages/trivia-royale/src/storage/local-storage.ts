import type { Hex } from "viem";
import type { State } from "@erc7824/nitrolite";
import { replacerBigInt, reviverBigInt } from "./serialization";
import type { StateStorage } from "./in-memory";

export const createLocalStateStorage = (): StateStorage => {
  const getStorageKey = (channelId: Hex): string => {
    return `nitrolite:channel:${channelId}`;
  };

  return {
    getChannelState: async (channelId: Hex) => {
      const key = getStorageKey(channelId);
      const data = window.localStorage.getItem(key);

      if (!data) {
        return [];
      }

      return JSON.parse(data, reviverBigInt) as State[];
    },
    appendChannelState: async (channelId: Hex, state: State) => {
      const key = getStorageKey(channelId);
      const existing = await createLocalStateStorage().getChannelState(channelId);

      existing.push(state);

      window.localStorage.setItem(
        key,
        JSON.stringify(existing, replacerBigInt)
      );
    }
  };
};
