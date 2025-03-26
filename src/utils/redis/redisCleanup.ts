import redis from "@/utils/redis";
import { registerUserId, removeUserId } from "@/utils/userIdManagement";

const ACTIVE_USER_IDS_KEY = "global:active:user:ids";

/**
 * Runs a cleanup operation to remove notes older than 2 months
 * and synchronize the user ID registry
 */
export async function cleanupOldNotes() {
  try {
    // Calculate cutoff time (2 months ago in milliseconds)
    const TWO_MONTHS_MS = 2 * 30 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - TWO_MONTHS_MS;

    // The Lua script to run
    const cleanupScript = `
      local userKeysPattern = KEYS[1]
      local cutoffTime = tonumber(ARGV[1])
      local totalRemoved = 0
      local emptyUsers = {}
      local activeUsers = {}
      local inactiveUsers = {}
      
      local cursor = "0"
      local userKeys = {}
      
      repeat
        local result = redis.call("SCAN", cursor, "MATCH", userKeysPattern)
        cursor = result[1]
        
        for _, key in ipairs(result[2]) do
          table.insert(userKeys, key)
        end
      until cursor == "0"
      
      for _, userKey in ipairs(userKeys) do
        local userId = string.match(userKey, "notes:(.+)")
        local notes = redis.call("GET", userKey)
        
        if notes then
          local notesArray = cjson.decode(notes)
          local originalCount = #notesArray
          local newNotesArray = {}
          local isActive = false
          
          for i, note in ipairs(notesArray) do
            if not note.updatedAt or note.updatedAt > cutoffTime then
              table.insert(newNotesArray, note)
              isActive = true
            end
          end
          
          if #newNotesArray < originalCount then
            totalRemoved = totalRemoved + (originalCount - #newNotesArray)
            
            if #newNotesArray == 0 then
              -- Remove empty records
              redis.call("DEL", userKey)
              table.insert(emptyUsers, userId)
            else
              -- Update with filtered notes
              redis.call("SET", userKey, cjson.encode(newNotesArray))
              
              -- Track as active
              if isActive then
                table.insert(activeUsers, userId)
              else
                table.insert(inactiveUsers, userId)
              end
            end
          else
            -- No notes removed but still check activity status
            if isActive then
              table.insert(activeUsers, userId)
            else
              table.insert(inactiveUsers, userId)
            end
          end
        end
      end
      
      return {totalRemoved, cjson.encode(emptyUsers), cjson.encode(activeUsers), cjson.encode(inactiveUsers), #userKeys}
    `;

    // Execute the Lua script
    const result = await redis.eval(
      cleanupScript,
      ["notes:*"], // Array of keys
      [cutoffTime.toString()], // Array of arguments
    );

    // Parse the results
    const [
      totalRemoved,
      emptyUsersJson,
      activeUsersJson,
      inactiveUsersJson,
      totalUsers,
    ] = result as [number, string, string, string, number];

    const emptyUsers = JSON.parse(emptyUsersJson);
    const activeUsers = JSON.parse(activeUsersJson);
    const inactiveUsers = JSON.parse(inactiveUsersJson);

    console.log(
      `Cleanup completed: Removed ${totalRemoved} notes, ${emptyUsers.length} empty users out of ${totalUsers} total users`,
    );

    // Now update the user ID registry
    let orphanedUsersRemoved = 0;
    let activeUsersAdded = 0;

    // Get the current registry
    const currentActiveUserIds = (await redis.smembers(
      ACTIVE_USER_IDS_KEY,
    )) as string[];

    // 1. Add all active users to the registry
    for (const userId of activeUsers) {
      if (!currentActiveUserIds.includes(userId)) {
        await registerUserId(userId);
        activeUsersAdded++;
      }
    }

    // 2. Remove all empty/inactive users from registry
    for (const userId of [...emptyUsers, ...inactiveUsers]) {
      await removeUserId(userId);
    }

    // 3. Clean up orphaned users (in registry but not in Redis)
    const allRedisUsers = new Set([...activeUsers, ...inactiveUsers]);
    for (const registryId of currentActiveUserIds) {
      if (!allRedisUsers.has(registryId)) {
        await removeUserId(registryId);
        orphanedUsersRemoved++;
      }
    }

    return {
      success: true,
      stats: {
        totalRemoved,
        emptyUsersRemoved: emptyUsers.length,
        inactiveUsers: inactiveUsers.length,
        orphanedUsersRemoved,
        activeUsersAdded,
        totalUsers,
      },
    };
  } catch (error) {
    console.error("Redis cleanup failed:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}
