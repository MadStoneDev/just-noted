import { v4 as uuidv4 } from "uuid";

const generateUniqueId = () => {
  const uuid = uuidv4();
  const timestamp = Date.now();
  return `${uuid}-${timestamp}`;
};
