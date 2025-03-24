const generateUuid4 = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const generateNoteId = (existingIds: string[]) => {
  console.log(existingIds);
  const existingUuidSet = new Set(existingIds);

  while (true) {
    const uuid = generateUuid4();

    if (!existingUuidSet.has(uuid)) {
      console.log(uuid);
      return uuid;
    }
  }
};
