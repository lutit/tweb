## AyuGram message history: deleted & edited messages (for codex)

This document explains how AyuGram for Android implements local history for deleted and edited messages. It is written to help you re‑implement the same behavior in another Telegram client (with different code structure), focusing on data flows, logic and the relevant TL (Telegram) objects.

All paths below are workspace‑relative to this repo.

---

## 1. High‑level concept

- AyuGram adds a **separate local database** (Room, `AyuDatabase`) which stores:
  - Every **revision of an edited message** (`EditedMessage` table).
  - Every **message that got deleted from the server or locally** (`DeletedMessage` table) plus its final reaction summary (`DeletedMessageReaction` table).
- These tables contain **denormalized snapshots** of the original `TLRPC.Message`:
  - Basic identifiers: user, dialog, topic, message id, grouped id, peer id, from id, dates.
  - Message content: plain text, entities (TL‑serialized), media info, mime type, thumbnails, document attributes, flags (views, forwards, reply/fwd headers etc.).
- The client hooks into **three main flows**:
  1. When Telegram reports that a message was **deleted**.
  2. When Telegram reports that a message was **edited** (new message replaces an old one).
  3. When the user **manually deletes** messages but asks to "keep locally" (AyuGram option).
- UI then reads from this local DB to:
  - Show **edit history** for a message.
  - Show **details of locally stored deleted messages**.
  - Mark messages in the chat as `ayuDeleted` (visually altered, reactions disabled, etc.).

Nothing is pushed back to Telegram: this is purely **client‑side history**.

---

## 2. Data model (local database)

### 2.1. Room database

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/AyuDatabase.java`

- Database definition:
  - Entities:
    - `EditedMessage` – one row per revision.
    - `DeletedMessage` – one row per deleted message.
    - `DeletedMessageReaction` – reactions snapshot per deleted message.
  - Version: `21`.

Schema snapshot: `TMessagesProj/schemas/com.radolyn.ayugram.database.AyuDatabase/21.json`.

### 2.2. Common message fields (`AyuMessageBase`)

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/entities/AyuMessageBase.java`

Shared by `EditedMessage` and `DeletedMessage`. Important fields:

- Identification and routing:
  - `long userId` – local Telegram account user id (`UserConfig.getClientUserId()`).
  - `long dialogId` – dialog id (`MessageObject.getDialogId(message)` / `message.dialog_id`).
  - `long groupedId` – media group id (`message.grouped_id` for albums).
  - `long peerId` – peer id (chat/user/channel).
  - `long fromId` – author.
  - `long topicId` – forum topic id (`MessageObject.getTopicId`).
  - `int messageId` – message id within dialog.
  - `int date` – original send date.
- Flags and counters:
  - `int flags` – raw Telegram message flags.
  - `int editDate` – last edit date.
  - `int views` – view counter.
- Forward info:
  - `int fwdFlags`
  - `long fwdFromId`
  - `String fwdName`
  - `int fwdDate`
  - `String fwdPostAuthor`
- Reply info:
  - `int replyFlags`
  - `int replyMessageId`
  - `long replyPeerId`
  - `int replyTopId`
  - `boolean replyForumTopic`
- History bookkeeping:
  - `int entityCreateDate` – **when this snapshot row was created**, seconds since epoch.
- Content:
  - `String text` – plain text message content.
  - `byte[] textEntities` – TL‑serialized `MessageEntity[]`.
  - `String mediaPath` – full path to associated main media file (photo/video/document/voice/etc.).
  - `String hqThumbPath` – full path to high‑quality thumbnail (if any).
  - `int documentType` – internal enum (e.g. photo, video, file, voice, sticker, etc., see `AyuConstants.DOCUMENT_TYPE_*`).
  - `byte[] documentSerialized` – TL‑serialized `TLRPC.Document` for some types (stickers, etc.).
  - `byte[] thumbsSerialized` – TL‑serialized list of photo/video thumbs.
  - `byte[] documentAttributesSerialized` – TL‑serialized list of `DocumentAttribute`.
  - `String mimeType` – raw MIME type.

You can consider `AyuMessageBase` as a **flattened local TL message snapshot**:

- It stores enough data to reconstruct a `TLRPC.Message` later (using mapping helpers).
- It also includes local FS paths for downloaded media so that content can be opened even after the original chat message has been deleted/edited.

### 2.3. Edited messages

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/entities/EditedMessage.java`

- Entity: `EditedMessage extends AyuMessageBase`.
- Primary key:
  - `@PrimaryKey(autoGenerate = true) long fakeId`.
- Table name: `EditedMessage` (Room default from class name, see schema).
- Rows:
  - Each **edit event** produces one row.
  - For a single logical message (`userId + dialogId + messageId`), there may be many rows ordered by `entityCreateDate` (oldest revision first).

### 2.4. Deleted messages

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/entities/DeletedMessage.java`

- Entity: `DeletedMessage extends AyuMessageBase`.
- Primary key:
  - `@PrimaryKey(autoGenerate = true) long fakeId`.
- Table name: `DeletedMessage`.
- Each deleted message is stored once per `(userId, dialogId, topicId, messageId)`.

Additionally there is a wrapper:

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/entities/DeletedMessageFull.java`

- `@Embedded DeletedMessage message;`
- `@Relation(parentColumn = "fakeId", entityColumn = "deletedMessageId") List<DeletedMessageReaction> reactions;`

### 2.5. Deleted message reactions

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/entities/DeletedMessageReaction.java`

Fields:

- `@PrimaryKey(autoGenerate = true) long fakeReactionId;`
- `long deletedMessageId;` – FK referencing `DeletedMessage.fakeId`.
- `String emoticon;` – Unicode emoji (for standard reactions).
- `long documentId;` – custom emoji document id.
- `boolean isCustom;` – `true` for custom emoji, `false` otherwise.
- `int count;` – reaction count from `TL_messageReactions`.
- `boolean selfSelected;` – whether the current user has selected this reaction.

---

## 3. Data access layer (DAOs)

### 3.1. EditedMessageDao

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/dao/EditedMessageDao.java`

Key methods:

- `List<EditedMessage> getAllRevisions(long userId, long dialogId, long messageId)`  
  - Returns **full edit history** ordered by `entityCreateDate` (ascending).
- `EditedMessage getLastRevision(long userId, long dialogId, long messageId)`  
  - Returns **latest revision** (descending by `entityCreateDate`).
- `boolean hasAnyRevisions(long userId, long dialogId, long messageId)`  
  - Quick existence check, used to decide if "Edits history" context menu entry should appear.
- `void updateAttachmentForRevisionsBetweenDates(long userId, long dialogId, long messageId, String oldPath, String newPath)`  
  - Updates `mediaPath` for previous revisions when media file is changed and old file disappears.
- Sync‑related:
  - `int getSyncCount(long userId, long fromDate)`  
  - `List<EditedMessage> getForSync(long userId, long fromDate, int offset)`  
  - These are used by AyuSync (remote sync) but can be ignored if you don’t want server‑side sync.
- `void insert(EditedMessage revision)` – inserts one revision row.

### 3.2. DeletedMessageDao

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/database/dao/DeletedMessageDao.java`

Key methods:

- `DeletedMessageFull getMessage(long userId, long dialogId, int messageId)`  
  - Fetches deleted message plus its reactions.
- `List<DeletedMessageFull> getMessages(long userId, long dialogId, long topicId, int startId, int endId, int limit)`  
  - Range query by `messageId`, topic and dialog.
- `List<DeletedMessageFull> getMessagesGrouped(long userId, long dialogId, long groupedId)`  
  - Fetches all messages in a media group (albums, grouped messages).
- `long insert(DeletedMessage msg)`  
  - Inserts one deleted message and returns its `fakeId`.
- `void insertReaction(DeletedMessageReaction reaction)`  
  - Inserts associated reaction row.
- `boolean exists(long userId, long dialogId, long topicId, int msgId)`  
  - Deduplication check to avoid duplicates.
- `void delete(long userId, long dialogId, int msgId)`  
  - Removes a single deleted message (also used when the user explicitly deletes saved history for a given message).

---

## 4. Core controller: AyuMessagesController

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/messages/AyuMessagesController.java`

This class centralizes logic for saving and retrieving edited/deleted message snapshots.

### 4.1. Attachments folder

At the top:

- `attachmentsSubfolder = "Saved Attachments"` – subfolder name.
- `attachmentsPath` – `<Public Downloads>/<AyuConstants.APP_NAME>/Saved Attachments`.

Initialization:

- `initializeAttachmentsFolder()`:
  - Creates directory if not exists.
  - Creates `.nomedia` file to keep attachments out of gallery indexing.

This is where AyuGram stores copies of media files referenced by history entries, via proprietary mapping helpers (`AyuMessageUtils.mapMedia`).

### 4.2. Construction and singleton

Private constructor:

- Calls `initializeAttachmentsFolder()`.
- Gets DAOs from `AyuData`:
  - `editedMessageDao = AyuData.getEditedMessageDao()`.
  - `deletedMessageDao = AyuData.getDeletedMessageDao()`.

Singleton:

- `static AyuMessagesController getInstance()` lazily initializes a single instance.

### 4.3. Handling message edits

Public entry points:

- `onMessageEdited(AyuSavePreferences prefs, TLRPC.Message newMessage)`:
  - Wraps `onMessageEditedInner(...)` with try/catch.
- `onMessageEditedForce(AyuSavePreferences prefs)`:
  - Forces creation of a revision from the message stored in `prefs` (used when media is being wiped locally, e.g. "clear media" operations).

Core logic: `onMessageEditedInner(AyuSavePreferences prefs, TLRPC.Message newMessage, boolean force)`

1. **Per‑dialog enable check**
   - Uses `AyuConfig.saveEditedMessageFor(accountId, dialogId)`:
     - Respects global setting `AyuConfig.saveMessagesHistory`.
     - Skips bots unless `AyuConfig.saveForBots` is enabled.
2. **Compare old vs new message**
   - `oldMessage = prefs.getMessage()` – snapshot of message before applying server edit.
   - Detect whether media is the same:
     - If both `media` are `TL_messageMediaPhoto`, compare `photo.id`.
     - If both are `TL_messageMediaDocument`, compare `document.id`.
     - Otherwise, fall back to comparing class and null checks.
   - When `force == true`:
     - `sameMedia = false` regardless of actual media; used to guarantee a revision even if text/media appear unchanged.
   - If `sameMedia` and text is equal (`TextUtils.equals(oldMessage.message, newMessage.message)`):
     - **Do nothing** – no history entry if nothing changed.
3. **Create history entry**
   - Instantiate `EditedMessage revision = new EditedMessage();`
   - Populate base fields:
     - `AyuMessageUtils.map(prefs, revision);`
   - Populate media fields:
     - `AyuMessageUtils.mapMedia(prefs, revision, !sameMedia);`
     - Third flag indicates if new media is actually different and may need copying.
4. **Media path normalization across revisions**
   - If media changed (`!sameMedia`) and `revision.mediaPath` is not empty:
     - Fetch `lastRevision = editedMessageDao.getLastRevision(userId, dialogId, messageId);`
     - If last revision exists and:
       - `lastRevision.mediaPath != revision.mediaPath`,
       - `lastRevision.mediaPath` is not null,
       - and `lastRevision.mediaPath` does not already point inside `Saved Attachments` folder,
       - then:
         - Call `editedMessageDao.updateAttachmentForRevisionsBetweenDates(...)` to update `mediaPath` for previous revisions to a new stored file path.
         - This ensures chronological revisions still point to a valid file even if earlier files were removed.
5. **Insert revision**
   - `editedMessageDao.insert(revision);`
6. **Notify UI**
   - On UI thread, post:
     - `NotificationCenter.getInstance(accountId).postNotificationName(AyuConstants.MESSAGE_EDITED_NOTIFICATION, dialogId, messageId);`
   - `AyuMessageHistory` listens for this notification and reloads its list.

### 4.4. Handling message deletions

Public entry point:

- `onMessageDeleted(AyuSavePreferences prefs)`:
  - Validates `prefs.getMessage() != null`.
  - Calls `onMessageDeletedInner(prefs)` with error logging.

Core logic: `onMessageDeletedInner(AyuSavePreferences prefs)`

1. **Per‑dialog enable check**
   - Uses `AyuConfig.saveDeletedMessageFor(accountId, dialogId)`:
     - Respects global setting `AyuConfig.saveDeletedMessages`.
     - Skips bots unless `AyuConfig.saveForBots` is enabled.
2. **Deduplication**
   - `deletedMessageDao.exists(userId, dialogId, topicId, messageId)`:
     - If row exists, **return** – no duplicates.
3. **Create deleted message entry**
   - `DeletedMessage deletedMessage = new DeletedMessage();`
   - Basic identifiers:
     - `deletedMessage.userId = prefs.getUserId();`
     - `deletedMessage.dialogId = prefs.getDialogId();`
     - `deletedMessage.messageId = prefs.getMessageId();`
     - `deletedMessage.entityCreateDate = prefs.getRequestCatchTime();` (time when deletion was observed, in seconds).
   - Log for debugging.
   - Populate all message data:
     - `AyuMessageUtils.map(prefs, deletedMessage);`
     - `AyuMessageUtils.mapMedia(prefs, deletedMessage, true);` – final `true` indicates media must be fully saved for deleted message (best effort copy into attachments folder).
4. **Insert deleted message**
   - `long fakeMsgId = deletedMessageDao.insert(deletedMessage);`
5. **Save reactions snapshot (optional)**
   - Only if:
     - Original `msg` is not null,
     - `msg.reactions` is not null,
     - `AyuConfig.saveReactions` is enabled.
   - Then call `processDeletedReactions(fakeMsgId, msg.reactions)`:
     - Iterate `TL_messageReactions.results`:
       - Skip `TL_reactionEmpty`.
       - Construct `DeletedMessageReaction`:
         - `deletedMessageId = fakeMsgId;`
         - `count`, `selfSelected`, plus either:
           - `emoticon` from `TL_reactionEmoji`, or
           - `documentId` from `TL_reactionCustomEmoji` and `isCustom = true`.
       - Insert via `deletedMessageDao.insertReaction(deletedReaction);`

### 4.5. Public read/delete API

Methods exposed for UI and other components:

- `boolean hasAnyRevisions(long userId, long dialogId, int messageId)`  
  - Simple passthrough to `EditedMessageDao`.
- `List<EditedMessage> getRevisions(long userId, long dialogId, int messageId)`  
  - Returns full edit history.
- `DeletedMessageFull getMessage(long userId, long dialogId, int messageId)`  
  - Fetches one deleted message with reactions.
- `List<DeletedMessageFull> getMessages(long userId, long dialogId, long topicId, int startId, int endId, int limit)`  
  - Paged history for a topic.
- `List<DeletedMessageFull> getMessagesGrouped(long userId, long dialogId, long groupedId)`  
  - History for a media group (albums etc.).
- `void delete(long userId, long dialogId, int messageId)`  
  - Deletes a saved deleted message entry and its media file (if exists).
  - Implementation:
    - Fetch `DeletedMessageFull msg = getMessage(...)`.
    - `deletedMessageDao.delete(userId, dialogId, messageId);`
    - If `msg.message.mediaPath` not empty:
      - Delete file at that path if it exists.
- `void clean()`  
  - Recreates the Room database (`AyuData.clean()` + `AyuData.create()`) and nulls singleton instance.

---

## 5. Triggers and integration points

To replicate behavior, you don’t need identical classes, only similar **hooks in message lifecycle**.

### 5.1. AyuSavePreferences – capture context for saving

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/messages/AyuSavePreferences.java`

Purpose:

- A simple value object carrying:
  - `TLRPC.Message message;` – snapshot before change.
  - `int accountId;`
  - `long userId;` – from `UserConfig.getInstance(accountId).getClientUserId()`.
  - `long dialogId;`
  - `int topicId;` – derived via `MessageObject.getTopicId(msg, false)`.
  - `int messageId;`
  - `int requestCatchTime;` – current wall time in seconds.

Key constructors:

- `AyuSavePreferences(TLRPC.Message msg, int accountId)`:
  - Uses values from the message itself: `msg.dialog_id`, `msg.id`, etc.
  - Sets `requestCatchTime = nowUnixSeconds`.
- `AyuSavePreferences(TLRPC.Message msg, int accountId, long dialogId, int topicId, int messageId, int requestCatchTime)`:
  - Used when some values come from external context (e.g., TTL deletion or missing `dialog_id` in updates).

This pattern can be reproduced as a **"context object" passed to history controller**.

### 5.2. Global configuration gates (AyuConfig)

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/AyuConfig.java` (relevant parts)

- `static boolean saveDeletedMessages;`
- `static boolean saveMessagesHistory;`
- `static boolean saveForBots;`
- Methods:
  - `static boolean saveDeletedMessageFor(int accountId, long dialogId)`:
    - Returns `false` if `saveDeletedMessages` is disabled.
    - Otherwise, checks peer user; for bots, respects `saveForBots`.
  - `static boolean saveEditedMessageFor(int accountId, long dialogId)`:
    - Similar logic but uses `saveMessagesHistory`.
  - `static boolean saveReactions;`:
    - Controls reaction snapshot recording.

Your client should expose similar user settings and wrap history logic behind checks.

### 5.3. Deletion hooks

#### 5.3.1. Central deleteMessages flow

File: `TMessagesProj/src/main/java/org/telegram/messenger/MessagesController.java:6090+`

Method:  
`deleteMessages(ArrayList<Integer> messages, ArrayList<Long> randoms, EncryptedChat encryptedChat, long dialogId, boolean forAll, boolean scheduled, boolean cacheOnly, long taskId, TLObject taskRequest)`

Inserted AyuGram hook:

1. If `!scheduled && AyuConfig.saveDeletedMessages`:
   - **Secret chats TTL messages** (encrypted dialog + explicit ids):
     - For each `msgId`:
       - Skip if `AyuState.isDeletePermitted(dialogId, msgId)` (internal "do not log this delete" flag).
       - Resolve `MessageObject` either from `dialogMessagesByIds` or `MessagesStorage`.
       - Build `AyuSavePreferences` from `messageOwner` and `currentAccount`, set `dialogId`.
       - Call `AyuMessagesController.getInstance().onMessageDeleted(prefs)`.
   - Then post `AyuConstants.MESSAGES_DELETED_NOTIFICATION` with dialog id and list of ids to invalidate UI and set `ayuDeleted` flag locally.
2. If `messages != null && !messages.isEmpty() && taskId != 0)`:
   - Handles **TTL deletions from server**:
     - For each `msgId`:
       - Skip `AyuState.isDeletePermitted(...)`.
       - Load `msg` from storage.
       - If `msg.ttl > 0 || msg.ttl_period > 0`:
         - Create `AyuSavePreferences`.
         - Call `onMessageDeleted(prefs)`.
   - Again, UI is notified via `MESSAGES_DELETED_NOTIFICATION`.
3. Else if `messages != null && !messages.isEmpty()`:
   - Handles **manual deletion of already saved deleted messages**:
     - `ayuMessagesController.delete(userId, dialogId, msgId)` for ids where `AyuState.isDeletePermitted(dialogId, msgId)` is `true`.
     - This allows user to clean AyuGram history for specific messages.

#### 5.3.2. UI‑level delete dialog ("keep locally")

File: `TMessagesProj/src/main/java/org/telegram/ui/Components/AlertsCreator.java:5640+`

Inside the delete confirmation dialog:

- There is a checkbox `keepLocally` (AyuGram‑specific).
- On confirm:
  - If `keepLocally` is **false**:
    - Call `AyuState.permitDeleteMessage(dialogId, msgId)` so that history entry is not created later.
  - If `keepLocally` is **true**:
    - Build `AyuSavePreferences` with original `messageOwner`.
    - Call `AyuMessagesController.getInstance().onMessageDeleted(prefs)` **before** actual deletion request is sent to Telegram.
  - In both single and multi‑delete branches, same pattern is used.
- After this, UI posts `MESSAGES_DELETED_NOTIFICATION` to mark messages as `ayuDeleted`.

This is how AyuGram implements "delete for everyone but keep a local copy".

#### 5.3.3. Handling deletions from updates

File: `TMessagesProj/src/main/java/org/telegram/messenger/MessagesController.java:15193+`

Within updates processing:

- `deletedMessages` is a `LongSparseArray<ArrayList<Integer>>` keyed by possible dialog ids.
- After processing normal updates, AyuGram adds:
  - If `AyuConfig.saveDeletedMessages && deletedMessages != null`:
    - `currentTimeS = currentTime / 1000`.
    - For each `(possibleDialogId, messageIds)`:
      - If `possibleDialogId == 0`:
        - Ask `MessagesStorage.getDialogIdsToUpdate(...)` to get actual dialog ids for these message ids (because some updates don’t include dialog id).
      - For each resolved `dialogId`:
        - For each `msgId` in list:
          - `msg = messagesStorage.getMessage(dialogId, msgId);`
          - `topicId = MessageObject.getTopicId(msg, isForum(dialogId));`
          - Build `AyuSavePreferences(msg, currentAccount, dialogId, topicId, msgId, currentTimeS)`.
          - Call `AyuMessagesController.onMessageDeleted(prefs)`.
        - Post `AyuConstants.MESSAGES_DELETED_NOTIFICATION` for UI.

This covers deletion events that arrive purely as updates (e.g., deletion by other participants).

#### 5.3.4. ChatActivity – marking items as visually deleted

File: `TMessagesProj/src/main/java/org/telegram/ui/ChatActivity.java:18642+`

`didReceivedNotification` handling for `AyuConstants.MESSAGES_DELETED_NOTIFICATION`:

- Extract `dialogId` and `messageIds`.
- If the current chat belongs to that dialog:
  - For each `mid`:
    - Locate `MessageObject currentMessage = messagesDict[0].get(mid);`
    - Set `currentMessage.messageOwner.ayuDeleted = true;`
    - Ask adapter to `updateRowWithMessageObject(currentMessage, false);`
- If `AyuState.getHideSelection()` was set (via "keep locally"), call `startMessageUnselect()` to clear selection state.

TL side:

- `TLRPC.Message` has extra boolean field `ayuDeleted` (see `TMessagesProj/src/main/java/org/telegram/tgnet/TLRPC.java:60925`).
- `ChatMessageCell` uses `ayuDeleted` to:
  - Change visual state (edited marker, labels).
  - Disable reactions if `ayuDeleted == true` (see checks in `ChatActivity` and `ChatMessageCell`).

### 5.4. Edit hooks

#### 5.4.1. When a message edit arrives from storage

File: `TMessagesProj/src/main/java/org/telegram/messenger/MessagesStorage.java:13520+`

During loading/storing updated messages (`load_type == -2` branch for update‑driven edits):

1. For each `Message message` in `messages.messages`:
   - Query old message bytes:
     - `"SELECT mid, data, ttl, mention, read_state, send_state, custom_params FROM messages_v2 WHERE mid = message.id AND uid = dialogId"`.
   - If found:
     - Deserialize `oldMessage` from `data`.
     - Restore attach path and TTL from DB.
   - Compute `sameMedia` similarly as in `AyuMessagesController`:
     - Compare photo ids or document ids.
   - If `message.from_id != null` and `(oldMessage.message != message.message || !sameMedia)`:
     - Build `AyuSavePreferences(oldMessage, currentAccount);`
     - Set `dialogId` into prefs.
     - Call:
       - `AyuMessagesController.getInstance().onMessageEdited(prefs, message);`
   - If `!sameMedia`, old attached files might be scheduled for deletion (`addFilesToDelete(oldMessage, ...)`).

This is the main hook where **server‑side edits** are turned into local history entries.

#### 5.4.2. When media is wiped locally (emptyMessagesMedia)

File: `TMessagesProj/src/main/java/org/telegram/messenger/MessagesStorage.java:4240+`

Method: `emptyMessagesMedia(long dialogId, ArrayList<Integer> mids)`

- For each row in `messages_v2` matching `mid IN (mids)`:
  - Deserialize `TLRPC.Message message`.
  - If `message.media != null`:
    - Attempt to schedule files for deletion.
    - AyuGram hook:
      - If `AyuConfig.saveMessagesHistory`:
        - Build `AyuSavePreferences(message, currentAccount);`
        - Set `dialogId`.
        - Call `AyuMessagesController.getInstance().onMessageEditedForce(prefs);`
    - Then null out media (set `document`/`photo` to `TL_*Empty`) and clear media flags.
  - Finally update row in DB with modified message.

Effect:

- Before local media is purged, a **forced edit history snapshot** is stored so user can still open the last known version via history (if media is preserved in attachments).

#### 5.4.3. High‑level edit notification from server

File: `TMessagesProj/src/main/java/org/telegram/messenger/MessagesController.java:14948+`

- When server indicates that a message was edited:
  - `AndroidUtilities.runOnUIThread(() -> getSendMessagesHelper().onMessageEdited(message));`
- `SendMessagesHelper.onMessageEdited(TLRPC.Message message)`:
  - Currently only used to cancel pending `waitingForCallback` entries for inline callbacks when reply markup changed.
  - Does not interact with Ayu history directly; the actual history is written in `MessagesStorage` as described above.

### 5.5. Viewing edit history

File: `TMessagesProj/src/main/java/com/radolyn/ayugram/ui/AyuMessageHistory.java`

This fragment displays the list of revisions (`EditedMessage` rows) and reconstructs `MessageObject` for each.

Key points:

- On creation (`updateHistory()`):
  - `messages = AyuMessagesController.getInstance().getRevisions(userId, dialogId, messageId);`
  - `rowCount = messages.size();`
- List adapter:
  - For each `EditedMessage`:
    - Create `TL_message` instance.
    - Call `AyuMessageUtils.map(editedMessage, msg, currentAccount);`
    - Call `AyuMessageUtils.mapMedia(editedMessage, msg);`
    - Override `msg.date = editedMessage.entityCreateDate;`
    - Set `msg.edit_hide = true;` (special field in `TLRPC.Message`).
    - Fix reply state using original message’s `replyMessage` / `reply_to`, etc.
    - Wrap into `MessageObject` and render via custom `AyuMessageCell`.
- UI observes `AyuConstants.MESSAGE_EDITED_NOTIFICATION` to refresh when new revisions are added.

### 5.6. "Edits history" entry in context menu

File: `TMessagesProj/src/main/java/org/telegram/ui/ChatActivity.java:25867+`

- In the long‑tap context menu for a message:
  - Before building menu entries:
    - `if (message != null && from_id != self && AyuMessagesController.hasAnyRevisions(userId, dialogId, messageId))`:
      - Insert menu item:
        - Text: `LocaleController.getString("EditsHistoryMenuText", R.string.EditsHistoryMenuText)`.
        - Option id: `AyuConstants.OPTION_HISTORY`.
        - Icon: `msg_log`.
- When this option is chosen:
  - `presentFragment(new AyuMessageHistory(selectedObject));`

---

## 6. Mapping between TL objects and DB rows

`AyuMessageUtils` is not included in this code dump (it’s in `com.radolyn.ayugram.proprietary`), but its responsibilities are clear from usage.

### 6.1. Direction 1: TL → DB (`map(...)` for save)

Used from:

- `AyuMessagesController.onMessageEditedInner(...)`
- `AyuMessagesController.onMessageDeletedInner(...)`

Probable behavior:

- From `AyuSavePreferences` and `TLRPC.Message`:
  - Fill all generic `AyuMessageBase` fields.
  - Flatten:
    - `message.entities` into a TL‑serialized blob (`textEntities`).
    - `message.media.document` and `photo.sizes` into `documentSerialized`, `thumbsSerialized`.
    - `message.media.document.attributes` into `documentAttributesSerialized`.
  - Handle `reply_to`, `fwd_from`, `views`, flags, TTL, etc.
  - Infer `documentType` from media type (e.g. sticker, GIF, file).
  - Decide what to store in `mediaPath` / `hqThumbPath`:
    - Likely:
      - If file already downloaded locally: copy or link to local file.
      - For edited messages, may reuse existing file path or copy into `Saved Attachments`.

### 6.2. Direction 2: DB → TL (`map(...)` for display)

Used from:

- `AyuMessageHistory.createMessageObject(...)`:
  - `AyuMessageUtils.map(EditedMessage, TL_message, accountId)`
  - `AyuMessageUtils.mapMedia(EditedMessage, TL_message)`

Probable behavior:

- Create a `TLRPC.TL_message` with:
  - Proper `id`, `dialog_id`, `date`, `from_id`, etc.
  - `message` string set from `text`.
  - Rebuilt `entities` from `textEntities`.
  - Reconstructed `MessageMedia`:
    - For photos/videos:
      - Create `TL_messageMediaPhoto` or `TL_messageMediaDocument`, attach restored `Document` or `Photo` with sizes.
      - Attach `mediaPath` as `attachPath` / local file path.
    - For voice/round video/sticker: set types, mime type, attributes, etc.
  - Re‑enable necessary custom fields:
    - `msg.edit_hide`, `msg.ttl`, `msg.attachPath`, etc.

Because content is reconstructed as a real `TLRPC.Message`, the rest of UI code can render it almost identically to live messages.

---

## 7. TL‑level / schema notes

Although AyuGram doesn’t modify Telegram’s official TL schemas on the wire, it adds fields in its local `TLRPC` bindings for convenience:

- `TLRPC.Message` extras (see `TMessagesProj/src/main/java/org/telegram/tgnet/TLRPC.java:60880+`):
  - `boolean ayuDeleted;`
  - `boolean ayuNoforwards;`
  - Several other custom fields (`send_state`, `ttl`, `destroyTime`, etc.) which are standard in modded Telegram clients.

Key TL types used by history:

- `TLRPC.Message`:
  - `id`, `from_id`, `peer_id`, `date`, `message` (text).
  - `MessageMedia media` (photo, document, etc.).
  - `ArrayList<MessageEntity> entities`.
  - `int edit_date`, `int views`, `MessageFwdHeader fwd_from`, `TL_messageReplyHeader reply_to`.
  - `TL_messageReactions reactions`.
- `TLRPC.TL_messageReactions` and subtypes:
  - `ArrayList<TL_messagePeerReaction> results` each with:
    - `Reaction` subtype:
      - `TL_reactionEmpty`
      - `TL_reactionEmoji { string emoticon; }`
      - `TL_reactionCustomEmoji { long document_id; }`
    - `int count;`
    - `boolean chosen;` (selfSelected).

Mapping to DB:

- Reaction types map directly to `DeletedMessageReaction` fields.
- Message content entities/media map to blobs via TL serialization (same encoding you use for messages in storage).

No new TL constructors are added on the network layer; these are only client‑side conveniences.

---

## 8. How to re‑implement this in another client

Below is a step‑by‑step plan to reproduce the behavior conceptually, independent of this specific codebase.

### 8.1. Storage design

1. Introduce a **local "message history" database** (any technology, Room/SQLite/Realm/etc.).
2. Define two main entities:
   - `EditedMessageHistoryEntry`:
     - Key: `(localAccountId, dialogId, messageId, entityCreateDate)` or a synthetic auto id.
     - Payload: flattened snapshot of message content + media references.
   - `DeletedMessageHistoryEntry`:
     - Key: `(localAccountId, dialogId, topicId, messageId)` with auto id.
     - Payload: flattened snapshot of message + reaction summary.
3. Optional: a third table `DeletedMessageReactionEntry` with:
   - `parentDeletedId`, `emoticon`, `documentId`, `isCustom`, `count`, `selfSelected`.
4. Adopt a **mapping layer**:
   - TL → DB row.
   - DB row → TL or your own internal chat message struct.

### 8.2. Capture points for edits

In your client’s message pipeline:

1. Whenever a **server update** indicates that message `M` changed:
   - Load the previous version from your persistent store (or last known version in memory).
   - Compare:
     - Changed text or changed media (compare media ids).
   - If changed:
     - Build a **history context object** similar to `AyuSavePreferences`:
       - Account id, dialog id, topic id, message id, timestamp when change is observed, old `Message`.
     - Pass to your `MessageHistoryController.onMessageEdited(context, newMessage)`.
   - In `onMessageEdited`:
     - Check user settings & peer type (skip bots, etc.).
     - Create one `EditedMessageHistoryEntry`:
       - Fill fields from old message and context.
       - If media changed:
         - Copy or "pin" the media file into your own attachments folder (if downloaded).
         - Update previous revisions to point to the new canonical stored file if old file was ephemeral.
     - Insert into DB.
2. When you perform **local media cleanup** (e.g., "Clear cache" for chat):
   - Before wiping media for a message, treat it as a **forced edit**:
     - Save a history snapshot that still has media references preserved (e.g., by copying to a separate folder).

### 8.3. Capture points for deletions

Hook history writing into all **delete paths**:

1. **User‑initiated delete**:
   - In delete confirmation UI:
     - Provide an option like "keep locally".
     - If user chooses:
       - For each message that will be deleted from server:
         - Build history context with the live `Message`.
         - Call `onMessageDeleted(context)`.
     - If user does **not** choose "keep locally", you may:
       - Mark internal flag `allowDeleteWithoutHistory` for these message ids so that later TTL or update‑driven deletes do not create history.
2. **Server‑initiated deletes via updates**:
   - When you receive updates representing message deletions:
     - For each `(dialogId, msgId)` pair:
       - If not explicitly marked as "allowed to be forgotten":
         - Load last stored version of the message from DB/storage.
         - Build context with previous message + current time.
         - Call `onMessageDeleted(context)`.
3. **TTL / auto‑delete**:
   - When your code schedules or handles TTL deletions:
     - Similar to server‑initiated case, but you may:
       - Only store history for messages with `ttl > 0` or `ttl_period > 0`.

### 8.4. UI behavior

1. **Marking locally deleted messages**:
   - Add a boolean flag into your message model, e.g. `bool locallyDeleted;`.
   - When history controller writes a deleted entry, post a UI event:
     - `(dialogId, [ids])`.
   - Chat UI listens for this event:
     - For each message id, set `locallyDeleted = true`.
     - Refresh corresponding rows.
   - UI can then:
     - Gray out text, show special "deleted" label, hide reactions, etc.
2. **Displaying edit history**:
   - When user long‑presses a message:
     - Ask history controller: `hasEdits(accountId, dialogId, messageId)`.
     - If true, show "View edits history" in the context menu.
   - On selection:
     - Open a new screen which:
       - Loads `getRevisions(accountId, dialogId, messageId)` ordered by `entityCreateDate`.
       - For each revision:
         - Rebuild a temporary `Message`/UI model.
         - Display as a normal message bubble or list cell.
3. **Optional "deleted history viewer"**:
   - Similarly, you can provide a UI that lists all deleted messages for a chat.
   - Use `getDeletedMessages(accountId, dialogId, topicId, range, limit)` etc.

### 8.5. Filesystem strategy

To avoid losing media referenced by history entries:

1. When you **first time** save history for a message with media:
   - Confirm that media is downloaded.
   - Copy the file (or move it) into a dedicated **"history attachments"** folder that:
     - Is not affected by regular cache cleaning.
     - Has `.nomedia` marker to avoid cluttering gallery.
2. Save the path to this file into the history entry (`mediaPath`, `thumbPath` etc.).
3. When deleting a history entry:
   - Optionally, delete the corresponding file.
4. When an edit updates media:
   - Repoint older revisions’ `mediaPath` to the new stored file if the old path was ephemeral.

### 8.6. TL mapping

For a different client:

- If you use your own TL bindings:
  - Mirror the fields you want to store in history (text, entities, media, thumbnails, fwd/reply headers, reactions).
- For reactions:
  - Snapshot only **summary information** (emoji/custom id, count, selfSelected).
  - No need to store per‑user reaction list.
- For serialization:
  - You can:
    - Use the same TL binary encoding as Telegram and store as blobs, or
    - Use JSON/your own struct schema.

The essential requirement is that your history entry contains enough data to rebuild a "fake" message for display later.

---

## 9. Minimal feature checklist

If you want a **feature‑complete clone** of AyuGram’s behavior, make sure you have:

1. **Settings:**
   - Global `saveDeletedMessages` toggle.
   - Global `saveEditedMessages` / `saveMessagesHistory` toggle.
   - Optional `saveForBots`, `saveReactions`.
2. **DB schema:**
   - Edited messages table with snapshot fields + creation time.
   - Deleted messages table with snapshot fields + creation time.
   - Deleted reactions table (if you care about reactions).
3. **Hooks:**
   - On message edit (server update + local media cleanup).
   - On message delete:
     - User manual delete (with "keep locally" option).
     - Delete via update from other participants.
     - TTL/auto‑delete logic.
4. **Controller:**
   - Singleton or equivalent coordinating:
     - Per‑dialog enable checks.
     - Deduplication.
     - Mapping TL ↔ DB row.
     - UI notifications.
5. **UI integration:**
   - `locallyDeleted` flag with UI update.
   - "View edits history" menu action.
   - Optional "deleted messages viewer".
6. **Filesystem:**
   - Dedicated, non‑cache directory for history media.
   - `.nomedia` marker.
   - Safe delete on history removal.

Once these parts are in place, you’ll have the same conceptual behavior as AyuGram: users can see previous edits and restore content of messages that are no longer present on Telegram’s servers, with optional cross‑device syncing if you later re‑implement AyuSync.

