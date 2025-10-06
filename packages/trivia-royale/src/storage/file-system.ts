import type { Address, Hex } from "viem";
import type { State } from "@erc7824/nitrolite";
import fs from "fs";
import { replacerBigInt, reviverBigInt } from "./serialization";
import type { StateStorage } from "./in-memory";

export const createFileSystemStateStorage = (walletAddress: Address): StateStorage => {
  const STATE_FILE = `state-${walletAddress}.json`;

  // Initialize file if it doesn't exist
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, '{}', 'utf8');
  }

  return {
    getChannelState: async (channelId: Hex) => {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'), reviverBigInt);
      return data[channelId] || [];
    },
    appendChannelState: async (channelId: Hex, state: State) => {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'), reviverBigInt);
      if (!data[channelId]) {
        data[channelId] = [];
      }
      data[channelId].push(state);
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, replacerBigInt, 2));
    }
  };
};
