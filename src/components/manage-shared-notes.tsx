import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  IconLink,
  IconUsers,
  IconWorld,
  IconUserX,
  IconCopy,
  IconCheck,
  IconEye,
  IconTrash,
  IconAlertCircle,
} from "@tabler/icons-react";

import { sharingOperation } from "@/app/actions/sharing";

interface SharedNote {
  id: string;
  noteId: string;
  title: string;
  shortcode: string;
  isPublic: boolean;
  sharedUsers: string[];
  viewCount: number;
  updatedAt: string;
  storage: string;
}

export default function ManageSharedNotes({ userId }: { userId: string }) {
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCodes, setCopiedCodes] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<{
    noteId: string;
    username: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const supabase = createClient();

  // Get all shared notes
  const fetchSharedNotes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, get all notes shared by this user
      const { data: sharedData, error: sharedError } = await supabase
        .from("shared_notes")
        .select(
          `
          id,
          note_id,
          shortcode,
          is_public,
          storage,
          view_count,
          created_at,
          updated_at
        `,
        )
        .eq("note_owner_id", userId);

      if (sharedError) {
        throw new Error(sharedError.message);
      }

      // Group by note_id to get unique notes
      const notesMap = new Map();

      for (const share of sharedData) {
        if (!notesMap.has(share.note_id)) {
          notesMap.set(share.note_id, {
            id: share.id,
            noteId: share.note_id,
            shortcode: share.shortcode,
            isPublic: share.is_public,
            storage: share.storage || "supabase",
            sharedUsers: [],
            viewCount: share.view_count || 0,
            updatedAt: share.updated_at || share.created_at,
          });
        }
      }

      // Get note titles
      const noteIds = Array.from(notesMap.keys());

      if (noteIds.length > 0) {
        const { data: notesData, error: notesError } = await supabase
          .from("notes")
          .select("id, title")
          .in("id", noteIds);

        if (notesError) {
          throw new Error(notesError.message);
        }

        // Add titles to the notes map
        for (const note of notesData) {
          if (notesMap.has(note.id)) {
            notesMap.get(note.id).title = note.title;
          }
        }

        // For each note, get shared users if not public
        for (const noteId of noteIds) {
          const result = await sharingOperation({
            operation: "getUsers",
            noteId,
            currentUserId: userId,
          });

          if (result.success) {
            const noteData = notesMap.get(noteId);
            noteData.isPublic = result.isPublic;
            noteData.sharedUsers = result.users || [];
          }
        }
      }

      setSharedNotes(Array.from(notesMap.values()));
    } catch (err) {
      console.error("Error fetching shared notes:", err);
      setError("Failed to load shared notes");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle copy link
  const handleCopyLink = (shortcode: string) => {
    const shareUrl = `${window.location.origin}/n/${shortcode}`;
    navigator.clipboard.writeText(shareUrl);

    setCopiedCodes({ ...copiedCodes, [shortcode]: true });
    setTimeout(() => {
      setCopiedCodes((prev) => ({ ...prev, [shortcode]: false }));
    }, 2000);
  };

  // Handle remove user
  const handleRemoveUser = async (noteId: string, username: string) => {
    setIsProcessing(true);

    try {
      const result = await sharingOperation({
        operation: "removeUser",
        noteId,
        username,
        currentUserId: userId,
      });

      if (result.success) {
        // Update the UI
        setSharedNotes((prev) =>
          prev.map((note) => {
            if (note.noteId === noteId) {
              return {
                ...note,
                sharedUsers: note.sharedUsers.filter(
                  (user) => user !== username,
                ),
              };
            }
            return note;
          }),
        );
      } else {
        setError(result.error || "Failed to remove user");
      }
    } catch (err) {
      console.error("Error removing user:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
      setConfirmRemoveUser(null);
    }
  };

  // Handle stop sharing
  const handleStopSharing = async (noteId: string) => {
    setIsProcessing(true);

    try {
      const result = await sharingOperation({
        operation: "stopSharing",
        noteId,
        currentUserId: userId,
      });

      if (result.success) {
        // Update the UI
        setSharedNotes((prev) => prev.filter((note) => note.noteId !== noteId));
      } else {
        setError(result.error || "Failed to stop sharing");
      }
    } catch (err) {
      console.error("Error stopping sharing:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
      setConfirmDelete(null);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Load shared notes on mount
  useEffect(() => {
    if (userId) {
      fetchSharedNotes();
    }
  }, [userId]);

  if (isLoading) {
    return (
      <div className="py-4 text-center text-gray-500">
        <div className="inline-block animate-spin h-5 w-5 border-2 border-mercedes-primary border-t-transparent rounded-full mr-2"></div>
        Loading shared notes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-red-500">
        <IconAlertCircle className="inline-block mr-2" size={18} />
        {error}
      </div>
    );
  }

  if (sharedNotes.length === 0) {
    return (
      <div className="py-4 text-center text-gray-500">
        <p>You haven't shared any notes yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Manage Shared Notes</h2>

      <div className="space-y-4">
        {sharedNotes.map((note) => (
          <div
            key={note.noteId}
            className="bg-white rounded-lg border p-4 shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-lg">
                  {note.title || "Untitled Note"}
                </h3>
                <div className="text-sm text-gray-500 flex items-center mt-1">
                  <IconEye size={16} className="mr-1" />
                  {note.viewCount} views · Last updated{" "}
                  {formatDate(note.updatedAt)}
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full flex items-center gap-1">
                    {note.storage === "redis" ? (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 32 32"
                          fill="#D82C20"
                        >
                          <path d="M30.0644 22.6419a3.3749 3.3749 0 0 0-.6443-1.0343 6.79 6.79 0 0 0-1.2952-1.1094 24.4565 24.4565 0 0 0-2.393-1.4042c-.3493-.1809-.71-.3618-1.0768-.5425-.1105-.0548-.3378-.1822-.5038-.2667-.3079-.1569-.6157-.3257-.9236-.4911-.25-.1337-.5-.2673-.7446-.4049-.5308-.2935-1.0707-.5869-1.6014-.8859-.199-.1114-.3981-.2227-.5971-.3341-.2446-.1367-.4892-.2735-.7337-.4163-.2226-.13-.4451-.26-.6692-.39-.0253-.0147-.11-.0635-.1355-.0782l-.064-.037c-.0593-.0344-.1186-.0688-.1778-.1031a.3015.3015 0 0 0-.0917-.0379 2.3757 2.3757 0 0 0-.4215-.0834 1.2642 1.2642 0 0 0-.2273-.0068 1.0945 1.0945 0 0 0-.569.1516 1.7062 1.7062 0 0 0-.4343.3548 2.4821 2.4821 0 0 0-.3319.4427c-.0228.0406-.0457.0811-.0686.1283-.0243.0597-.0453.126-.0515.1929a.8733.8733 0 0 0 .0173.3042c.0314.1023.0891.1957.1543.2667.0615.0669.1312.121.1988.1768.0745.0615.1489.1091.2257.1516.0737.0409.1474.0817.2258.1243.0782.0343.1564.0686.2287.101.0722.0324.1443.0649.2195.0989.1562.0633.3124.1266.4687.1899.1367.0552.2734.1105.41.1673.1427.059.2854.118.4294.1769.1337.0552.2673.1105.4014.1642.3004.1203.6008.2406.8965.3649.3156.1325.6312.2649.9453.3993.293.1259.586.2518.876.38.3171.14.6342.28.9469.4232.3141.1439.6282.2878.9388.4333.3141.1486.6282.2973.9377.4477.3095.1503.6191.3007.9246.4525a23.306 23.306 0 0 1 1.8093.9909c.287.1762.5739.3524.8554.5317.1369.0878.2737.1755.4068.2648.1393.0934.2786.1867.4147.2815.1508.1055.3016.211.449.3179.1563.1142.3125.2284.4647.3441.1606.1222.3212.2443.4758.3716.1217.1004.2434.2008.3612.3043a7.5127 7.5127 0 0 1 .2903.271 4.0112 4.0112 0 0 1 .6775.8972c.0457.0863.0913.1726.1267.2614.0328.0824.0656.1649.0876.2496.0214.0825.0428.165.0525.2479.0116.0981.0233.1961.0217.2945a1.6544 1.6544 0 0 1-.0525.4583 1.8261 1.8261 0 0 1-.1582.402 2.0358 2.0358 0 0 1-.4113.5066 2.24 2.24 0 0 1-.28.1978c-.0519.0305-.1038.061-.1573.0899a2.0388 2.0388 0 0 1-.3073.131l-.0769.0269a1.9683 1.9683 0 0 1-.3073.0816c-.1058.02-.2117.04-.3196.0512-.1128.0116-.2256.0233-.3397.0217a2.5298 2.5298 0 0 1-.3444-.0249 2.7335 2.7335 0 0 1-.3397-.069c-.1105-.0297-.221-.0594-.3292-.0996-.1142-.0416-.2284-.0831-.3397-.1312-.1151-.0498-.2303-.0996-.3436-.1526-.1128-.053-.2256-.106-.3364-.1606-.555-.2724-1.1101-.5447-1.6651-.8152-.555-.27-1.1099-.5425-1.6649-.8133-.4979-.242-1.0707-.5227-1.6014-.7826-.5308-.2614-1.0615-.5212-1.5908-.7826-.5052-.2498-1.0103-.4995-1.5155-.7477-.5052-.2483-1.0104-.4981-1.5139-.747-.5022-.2483-1.0044-.4965-1.5065-.7448-.1774-.0878-.3547-.1757-.5321-.263-.1981-.0979-.3962-.1959-.5927-.2938a2.6467 2.6467 0 0 0-.5927-.2556 1.3321 1.3321 0 0 0-.3073-.0581c-.0985-.0083-.197-.0166-.2939-.0017a.9547.9547 0 0 0-.2818.0546 1.313 1.313 0 0 0-.2613.1264 2.0388 2.0388 0 0 0-.2365.1691 2.9912 2.9912 0 0 0-.215.2002c-.067.0713-.134.1426-.1927.221-.0566.0763-.1133.1526-.1637.2347-.0505.0821-.101.1642-.143.2517-.0407.0852-.0815.1703-.1142.2588-.0352.0949-.0704.1898-.0967.2879-.014.0518-.028.1035-.0352.1561-.5.384-.1.767-.0121.1163-.15.1056-.29.2113.0007.3168a1.7682 1.7682 0 0 0 .0352.2305c.013.0686.026.1373.0467.2051.0272.0877.0544.1755.0896.2606.0321.0786.0643.1572.1053.2317.0469.0852.0937.1704.15.2506.0485.069.097.138.1533.2017.0607.0686.1214.1372.1864.1977.0579.0536.1158.1071.178.1533.0675.0504.135.1007.2064.1429.0675.04.135.08.206.1143.0783.0373.1566.0747.238.1054.0783.0293.1566.0587.238.0798.0828.0213.1656.0426.2516.0559.0845.013.169.026.2548.0326.0892.007.1784.014.2676.0116a2.47 2.47 0 0 0 .2818-.0183c.0953-.0116.1906-.0232.2841-.0415.092-.0182.184-.0365.2744-.0604a4.6243 4.6243 0 0 0 .2744-.0766c.0905-.0286.181-.0572.2699-.0908.0905-.0335.181-.067.2683-.106.0881-.04.1763-.08.2628-.1242.0896-.0458.1792-.0915.2659-.1423.0844-.0497.1688-.0993.251-.1522.0876-.0559.1752-.1118.2603-.1707.0827-.0573.1655-.1147.246-.1754.0873-.0659.1746-.1318.2594-.2008.084-.0685.168-.137.2491-.209.081-.072.162-.144.2402-.219.0766-.0744.1532-.1488.2265-.226.0741-.0783.1482-.1566.2192-.2381.065-.0752.13-.1504.1917-.2288.0624-.0786.1249-.1573.184-.2392a8.1307 8.1307 0 0 0 .1739-.25c.0547-.0852.1094-.1704.1608-.2573.0514-.087.1029-.174.1508-.263.0464-.0856.0929-.1713.1357-.2586.0434-.0877.0868-.1755.1271-.2644.0411-.0906.0823-.1811.1196-.2733.0358-.0891.0717-.1782.1041-.2682.0329-.0913.0658-.1827.0947-.2749.0261-.0836.0522-.1671.0759-.2519.0249-.0897.0499-.1795.0708-.2698.0194-.0835.0388-.167.0548-.2513.0168-.0889.0336-.1777.0462-.2676.0119-.0835.0239-.167.0328-.2511.0086-.0823.0172-.1646.023-.2473.0059-.0834.0117-.1669.0141-.2509.0024-.0835.0048-.167.0035-.2506a2.594 2.594 0 0 0-.0316-.5002 3.3526 3.3526 0 0 0-.1186-.5047 4.1333 4.1333 0 0 0-.2118-.5011c-.0857-.1749-.1714-.3499-.2734-.5144a6.6702 6.6702 0 0 0-.3501-.5226c-.1247-.17-.2494-.34-.391-.498-.1465-.1646-.293-.3293-.4535-.4795a9.3588 9.3588 0 0 0-.5268-.4629c-.181-.1476-.362-.2952-.5559-.4314-.1967-.1384-.3934-.2767-.6031-.3995-.2113-.1242-.4226-.2484-.645-.3565-.2243-.1088-.4486-.2176-.6859-.3103-.2386-.0932-.4771-.1865-.7289-.265-.2503-.0781-.5006-.1562-.7651-.2168-.2645-.0602-.529-.1204-.809-.1629-.2816-.0427-.5632-.0855-.8577-.1087-.2958-.0232-.5916-.0464-.9036-.0496-.31-.0031-.62-.0063-.9461.0102-.3268.0164-.6536.0328-.9985.0694-.3458.0367-.6917.0734-1.0509.1307-.3528.0565-.7056.113-1.0717.1894-.3645.0766-.729.1532-1.111.248-.3794.0947-.7589.1895-1.1544.3048-.3886.1136-.7772.2273-1.1824.3618-.4022.1331-.8044.2663-1.2213.4203C6.3305 10.4426 5.921 10.5973 5.5 10.7728c-.414.1732-.828.3464-1.2544.5394-.4246.192-.8492.384-1.2859.592-.4349.208-.8698.416-1.3133.6465a40.4752 40.4752 0 0 0-1.3117.6799c-.4309.2342-.8618.4684-1.2978.7235z" />
                        </svg>
                        <span className="bg-orange-100 text-orange-700 px-1 rounded-sm">
                          Local
                        </span>
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="#3ECF8E"
                        >
                          <path d="M21.97 6.27a2.96 2.96 0 0 0-1.12-1.26 3.74 3.74 0 0 0-1.97-.51c-1.14 0-2.2.39-3.08 1.07a1.1 1.1 0 0 0-.3-1.28 1.08 1.08 0 0 0-1.47.08 2.3 2.3 0 0 0-.43-.92 2.56 2.56 0 0 0-.76-.68 2.8 2.8 0 0 0-1.68-.32c-1.3.14-2.24.95-2.69 2.33-1.68-.96-3.52-.69-4.66.77-.54.69-.9 1.77-.72 3.28.17 1.47.97 2.97 2.2 4.2-1.12.94-1.49 2.4-.96 3.6.5 1.13 1.42 1.76 2.59 1.76.42 0 .86-.1 1.3-.29a4.1 4.1 0 0 0 1.26-.9c.3.37.66.7 1.08.95.42.26.93.4 1.5.4a3.14 3.14 0 0 0 2.38-1.06c0 .36.07.67.2.92.27.47.72.73 1.24.73.47 0 .93-.22 1.3-.63 1.24.72 2.36.53 3.22-.49.86-1.02 1.01-2.42.42-3.8a6.15 6.15 0 0 0 1.07-1.15 4.25 4.25 0 0 0 .58-1.43c.21-1.02.06-2.12-.5-3.37m-3.4 2.5a1.95 1.95 0 0 1-1.81 2.1c-.25.03-.51.02-.77-.02 0-.15-.01-.29-.05-.44a4.94 4.94 0 0 0-.72-1.84 5.94 5.94 0 0 0-1.33-1.38c.15-.31.33-.6.55-.87.39-.5.88-.9 1.46-1.16a1.95 1.95 0 0 1 2.67 3.6" />
                        </svg>
                        <span className="bg-green-100 text-green-700 px-1 rounded-sm">
                          Cloud
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleCopyLink(note.shortcode)}
                  className="p-1.5 text-gray-500 hover:text-mercedes-primary rounded-md"
                  title="Copy share link"
                >
                  {copiedCodes[note.shortcode] ? (
                    <IconCheck size={18} className="text-green-500" />
                  ) : (
                    <IconCopy size={18} />
                  )}
                </button>

                <button
                  onClick={() => setConfirmDelete(note.noteId)}
                  className="p-1.5 text-gray-500 hover:text-red-500 rounded-md"
                  title="Stop sharing"
                  disabled={isProcessing}
                >
                  <IconTrash size={18} />
                </button>
              </div>
            </div>

            {/* Sharing status */}
            <div className="mt-4 flex items-center text-sm">
              <div
                className={`flex items-center px-2 py-1 rounded-md ${
                  note.isPublic
                    ? "bg-blue-50 text-blue-700"
                    : "bg-indigo-50 text-indigo-700"
                }`}
              >
                {note.isPublic ? (
                  <>
                    <IconWorld size={16} className="mr-1.5" />
                    <span>Public</span>
                  </>
                ) : (
                  <>
                    <IconUsers size={16} className="mr-1.5" />
                    <span>Shared with {note.sharedUsers.length} users</span>
                  </>
                )}
              </div>

              <div className="ml-3 flex items-center text-sm text-gray-500">
                <IconLink size={16} className="mr-1.5" />
                <span className="text-gray-600 font-mono">
                  {window.location.origin}/{note.shortcode}
                </span>
              </div>
            </div>

            {/* Shared users list */}
            {!note.isPublic && note.sharedUsers.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Shared with:</h4>
                <ul className="space-y-1">
                  {note.sharedUsers.map((username) => (
                    <li
                      key={username}
                      className="flex items-center justify-between text-sm bg-gray-50 px-3 py-1.5 rounded"
                    >
                      <span>{username}</span>
                      <button
                        onClick={() =>
                          setConfirmRemoveUser({
                            noteId: note.noteId,
                            username,
                          })
                        }
                        className="text-gray-400 hover:text-red-500"
                        title="Remove user"
                        disabled={isProcessing}
                      >
                        <IconUserX size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confirmation dialogs */}
            {confirmDelete === note.noteId && (
              <div className="mt-3 border-t pt-3">
                <div className="bg-red-50 p-3 rounded-md">
                  <p className="text-sm text-red-700">
                    Are you sure you want to stop sharing this note?
                  </p>
                  <div className="mt-2 flex justify-end space-x-2">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md"
                      disabled={isProcessing}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleStopSharing(note.noteId)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-md flex items-center"
                      disabled={isProcessing}
                    >
                      {isProcessing && (
                        <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                      )}
                      Stop Sharing
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* User removal confirmation dialog */}
      {confirmRemoveUser && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">Remove User Access</h3>
            <p className="text-gray-700 mb-4">
              Are you sure you want to remove access for{" "}
              <strong>{confirmRemoveUser.username}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmRemoveUser(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleRemoveUser(
                    confirmRemoveUser.noteId,
                    confirmRemoveUser.username,
                  )
                }
                className="px-4 py-2 bg-red-600 text-white rounded-md flex items-center"
                disabled={isProcessing}
              >
                {isProcessing && (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                )}
                Remove Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
