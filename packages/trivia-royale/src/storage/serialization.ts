// BigInt JSON serialization helpers

export const replacerBigInt = (key: string, value: any): any => {
  return typeof value === 'bigint' ? value.toString() + 'n' : value;
};

export const reviverBigInt = (key: string, value: any): any => {
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
};
