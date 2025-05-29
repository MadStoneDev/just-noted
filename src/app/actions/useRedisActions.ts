"use server";

import { headers } from "next/headers";
import redis from "@/utils/redis";
import { Note } from "@/types/notes";

async function isBotRequest(action: string): Promise<boolean> {
  try {
    const { headers } = require("next/headers");

    try {
      const headersList = await headers();
      const isBotHeader = headersList?.get("x-is-bot");
      const isBot = isBotHeader === "true";

      if (isBot) {
        console.log(`Bot detected, skipping ${action}`);
      }

      return isBot;
    } catch (headerError) {
      console.log(
        `Headers not available during ${action}, assuming not a bot request`,
      );

      return false;
    }
  } catch (error) {
    console.error(`Error in isBotRequest for ${action}:`, error);
    return false;
  }
}

export const getNotesByUserId = async (userId: string): Promise<any> => {
  try {
    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    const notes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    return {
      success: true,
      notes,
    };
  } catch (error) {
    console.error("Error fetching notes:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
};
