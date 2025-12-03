import type {Message} from '../../layer';

export type AyuMomentType = 'deleted' | 'edited';

export type AyuMomentReason =
  | 'server_delete'
  | 'manual_keep'
  | 'ttl'
  | 'edit'
  | 'remote_unknown';

export type AyuMomentBase<T extends AyuMomentType = AyuMomentType> = {
  id: string;
  type: T;
  peerId: PeerId;
  messageId: number;
  threadId?: number;
  timestamp: number;
  reason: AyuMomentReason;
};

export type AyuDeletedMoment = AyuMomentBase<'deleted'> & {
  message: Message.message | Message.messageService;
};

export type AyuEditRevision = AyuMomentBase<'edited'> & {
  revision: number;
  message: Message.message | Message.messageService;
  newMessage?: Message.message | Message.messageService;
};

export type AyuMomentsStorageValue = AyuDeletedMoment | AyuEditRevision;

export type AyuEditHistory = {
  key: string;
  peerId: PeerId;
  messageId: number;
  lastUpdatedAt: number;
  revisions: AyuEditRevision[];
};

export type AyuMomentsSnapshot = {
  deleted: AyuDeletedMoment[];
  edits: AyuEditHistory[];
};

export type AyuMomentsUpdatePayload =
  | {action: 'add'; snapshot: AyuDeletedMoment | AyuEditRevision}
  | {action: 'remove'; id: string}
  | {action: 'reset'}
  | {action: 'replace-history'; history: AyuEditHistory};
