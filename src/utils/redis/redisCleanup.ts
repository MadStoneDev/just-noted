import redis from "@/utils/redis";

/**
 * Runs a cleanup operation to remove notes older than 6 months
 */
export async function cleanupOldNotes() {
  try {
    // Calculate cutoff time (6 months ago in milliseconds)
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - SIX_MONTHS_MS;

    // The Lua script to run (same as in the cleanup-script.lua file)
    const cleanupScript = `
      local userKeysPattern = KEYS[1]
      local cutoffTime = tonumber(ARGV[1])
      local totalRemoved = 0
      local usersAffected = 0
      
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
        local notes = redis.call("GET", userKey)
        
        if notes then
          local notesArray = cjson.decode(notes)
          local originalCount = #notesArray
          local newNotesArray = {}
          
          for i, note in ipairs(notesArray) do
            if not note.updatedAt or note.updatedAt > cutoffTime then
              table.insert(newNotesArray, note)
            end
          end
          
          if #newNotesArray < originalCount then
            redis.call("SET", userKey, cjson.encode(newNotesArray))
            totalRemoved = totalRemoved + (originalCount - #newNotesArray)
            usersAffected = usersAffected + 1
          end
        end
      end
      
      return {totalRemoved, usersAffected, #userKeys}
    `;

    // Execute the Lua script
    // KEYS[1] = pattern to match all user note keys
    // ARGV[1] = cutoff timestamp in milliseconds
    const result = await redis.eval(
      cleanupScript,
      ["notes:*"], // Array of keys (KEYS[1])
      [cutoffTime.toString()], // Array of arguments (ARGV[1])
    );

    // Parse the results
    const [totalRemoved, usersAffected, totalUsers] = result as number[];

    console.log(
      `Cleanup completed: Removed ${totalRemoved} notes from ${usersAffected} users (out of ${totalUsers} total users)`,
    );

    return {
      success: true,
      stats: {
        totalRemoved,
        usersAffected,
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
