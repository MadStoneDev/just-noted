import { v4 as uuidv4 } from "uuid";

const generateUuid4 = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const generateNoteId = (existingIds: string[]) => {
  const existingUuidSet = new Set(existingIds);

  while (true) {
    const uuid = generateUuid4();

    if (!existingUuidSet.has(uuid)) {
      return uuid;
    }
  }
};

export const getUserId = () => {
  const existingId = localStorage.getItem("notes_user_id");

  if (existingId) {
    return existingId;
  }

  const newId = uuidv4();
  localStorage.setItem("notes_user_id", newId);
  return newId;
};
